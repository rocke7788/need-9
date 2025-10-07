const express = require('express');
const crypto = require('crypto');
const https = require('https');
const app = express();
const port = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'text/plain' }));

// 不对外暴露宽松CORS；AdMob回调为服务端到服务端，无需CORS

// 健康检查
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'AdMob SSV服务器正常运行',
    timestamp: new Date().toISOString()
  });
});

// 简单健康检查
app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});

// —— 官方SSV验签实现 ——
// 参考文档：Validate server-side verification (SSV) callbacks | Google Developers
// 公钥来源（JSON）：https://www.gstatic.com/admob/reward/verifier-keys.json
const KEY_URLS = [
  'https://www.gstatic.com/admob/reward/verifier-keys.json',
  'https://gstatic.com/admob/reward/verifier-keys.json'
];

let keysCache = { keys: null, fetchedAt: 0 };
const CACHE_TTL_MS = 60 * 60 * 1000; // 1小时缓存

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (resp) => {
        let data = '';
        resp.on('data', (chunk) => (data += chunk));
        resp.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function fetchAdMobKeys() {
  for (const url of KEY_URLS) {
    try {
      const json = await httpsGetJson(url);
      if (json && Array.isArray(json.keys)) {
        return json.keys;
      }
    } catch (_) {
      // 继续下一个候选URL
    }
  }
  throw new Error('无法获取AdMob验证公钥');
}

async function getPublicKeyPemByKeyId(keyId) {
  const now = Date.now();
  if (!keysCache.keys || now - keysCache.fetchedAt > CACHE_TTL_MS) {
    const keys = await fetchAdMobKeys();
    keysCache = { keys, fetchedAt: now };
  }
  const matched = keysCache.keys.find(
    (k) => String(k.keyId || k.key_id) === String(keyId)
  );
  if (matched) return matched.pem;
  // 若缓存中没有匹配的key，强制刷新一次后重试（处理新key_id）
  try {
    const freshKeys = await fetchAdMobKeys();
    keysCache = { keys: freshKeys, fetchedAt: Date.now() };
    const matchedFresh = freshKeys.find(
      (k) => String(k.keyId || k.key_id) === String(keyId)
    );
    return matchedFresh ? matchedFresh.pem : null;
  } catch (_) {
    return null;
  }
}

function toBase64(signatureUrlSafe) {
  let s = String(signatureUrlSafe).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad) s += '='.repeat(4 - pad);
  return s;
}

function buildMessageFromQuery(req) {
  // 使用原始URL的查询串，按原顺序去掉signature参数
  const original = req.originalUrl || req.url || '';
  const qIndex = original.indexOf('?');
  if (qIndex === -1) return '';
  const path = original.substring(0, qIndex);
  const qs = original.substring(qIndex + 1);
  const parts = qs.split('&').filter((p) => !p.startsWith('signature='));
  return parts.join('&');
}

async function verifySSVWithAdMobKeys(req) {
  const { key_id, signature } = req.query || {};
  if (!key_id || !signature) return false;

  const pem = await getPublicKeyPemByKeyId(key_id);
  if (!pem) return false;

  const message = buildMessageFromQuery(req);
  if (!message) return false;

  const verifier = crypto.createVerify('sha256');
  verifier.update(message);
  verifier.end();
  const sigBuf = Buffer.from(toBase64(signature), 'base64');
  return verifier.verify(pem, sigBuf);
}

// SSV签名验证函数
// ———— 旧的HMAC自定义验签已移除，改为官方公钥验证 ————

// AdMob SSV验证端点
app.get('/verify-reward', async (req, res) => {
  try {
    // 基本安全检查：提醒非HTTPS（部署到云环境通常为HTTPS）
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    if (!isSecure) {
      console.warn('收到非HTTPS回调请求');
    }

    // 兼容 AdMob 控制台的“验证 URL”测试：该测试不会附带签名
    const { key_id, signature } = req.query || {};
    if (!key_id || !signature) {
      return res.status(200).send('OK');
    }

    const valid = await verifySSVWithAdMobKeys(req);
    if (valid) {
      // 可在此处执行奖励发放逻辑（例如记录transaction_id）
      res.status(200).send('OK');
    } else {
      res.status(401).send('Unauthorized');
    }
  } catch (error) {
    console.error('处理SSV请求时出错:', error);
    res.status(500).send('Internal Server Error');
  }
});

// 支持 HEAD 请求以通过某些健康检查/验证方式
app.head('/verify-reward', (req, res) => {
  res.status(200).end();
});

// 备用端点
app.post('/verify-reward', (req, res) => {
  res.redirect(307, '/verify-reward');
});

// 处理未知路由
app.all('*', (req, res) => {
  res.status(404).send('Not Found');
});

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('未处理的错误:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

app.listen(port, () => {
  console.log(`AdMob SSV服务器运行在端口 ${port}`);
});

module.exports = app;