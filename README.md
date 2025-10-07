# AdMob SSV 验证服务器

这是一个简单的 Google AdMob 奖励广告服务器端验证(SSV)服务器，用于验证用户是否真正观看了广告并应该获得奖励。

## 快速部署指南

### 方法一：使用 Vercel 部署（推荐）

1. 安装 [Vercel CLI](https://vercel.com/download)
   ```
   npm i -g vercel
   ```

2. 登录 Vercel
   ```
   vercel login
   ```

3. 在项目目录中部署
   ```
   cd admob-ssv-server
   vercel --prod -y
   ```

4. 按照提示完成部署，部署成功后，Vercel 会提供一个 HTTPS 网址（例如 `https://your-project.vercel.app`）

5. 您的验证回调 URL 将是：`https://your-project.vercel.app/verify-reward`

### 方法二：使用 GitHub 和 Vercel 部署

1. 在 GitHub 上创建一个新仓库
2. 将代码推送到该仓库
3. 在 [Vercel 控制台](https://vercel.com/dashboard) 中导入该项目
4. Vercel 会自动部署并提供 HTTPS 网址

## 在 AdMob 中配置 SSV 回调

1. 登录 [Google AdMob 控制台](https://apps.admob.com/)
2. 选择您的应用
3. 进入"奖励广告"设置
4. 启用"服务器端验证"
5. 在"回调 URL"字段中输入您的验证服务器地址：
   ```
   https://your-project.vercel.app/verify-reward
   ```
6. 保存设置

## 在 Unity 中配置用户 ID

为了跟踪哪个用户获得了奖励，您需要在显示广告前设置用户 ID：

```csharp
// 在您的游戏代码中
string userId = "玩家唯一ID"; // 可以是玩家账号ID或设备ID
GoogleMobileAds.Api.MobileAds.SetRequestConfiguration(
    new RequestConfiguration.Builder()
    .SetTestDeviceIds(new List<string>())
    .SetMaxAdContentRating(MaxAdContentRating.G)
    .SetTagForUnderAgeOfConsent(TagForUnderAgeOfConsent.Unspecified)
    .SetTagForChildDirectedTreatment(TagForChildDirectedTreatment.Unspecified)
    .SetUserId(userId) // 设置用户ID，这将在SSV回调中传递
    .build());
```

## 服务器工作原理

1. 当用户观看完奖励广告后，Google 会向您配置的回调 URL 发送请求
2. 服务器验证请求的签名是否有效
3. 如果验证成功，服务器会记录奖励信息并返回成功响应
4. 您可以根据需要扩展服务器功能，例如将奖励信息存储到数据库中

## 注意事项

- 公钥缓存时间设置为12小时，确保服务器能够处理 Google 的密钥轮换
- 服务器会验证所有必要的参数和签名
- 如需进一步定制，可以修改 `index.js` 中的奖励处理逻辑# need-9
