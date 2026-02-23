# 🌙 哄睡神器

> 臭屁宝的安睡小助手 💤

一款为新生宝宝打造的网页端哄睡应用。所有声音由 Web Audio API 实时合成，**无需联网、无需下载音频文件**，打开即用。

![preview](https://img.shields.io/badge/Tech-Vanilla_JS-F7DF1E?logo=javascript) ![preview](https://img.shields.io/badge/Audio-Web_Audio_API-8A2BE2) ![preview](https://img.shields.io/badge/License-MIT-green)

---

## ✨ 功能特色

### 🔊 白噪音引擎（6 种声音，可混合播放）

| 声音 | 合成方式 |
|------|---------|
| 白噪音 | 随机采样 + 低通滤波 |
| 粉噪音 | Voss-McCartney 算法 |
| 棕噪音 | 布朗运动随机游走 |
| 🌧️ 雨声 | 带通滤波白噪音 + 低频雷声 |
| 🌊 海浪 | LFO 调制棕噪音 + 泡沫嘶声 |
| 💓 心跳 | 双正弦振荡器 + 节律增益调制 |

- 每种声音支持**独立音量调节**
- 已做**响度归一化**，混合播放时音量均衡

### 🎵 摇篮曲（3 首经典旋律）

- ⭐ 小星星（Twinkle Twinkle Little Star）
- 🎶 勃拉姆斯摇篮曲（Brahms' Lullaby）
- 🎹 莫扎特摇篮曲（Mozart's Lullaby）

使用 `OscillatorNode` 正弦波合成 + 微失谐 chorus 效果，自动循环播放。

### 🌙 夜灯

- 全屏柔和光晕覆盖
- **亮度滑块**：0% ~ 100%
- **4 种色温**：暖黄 · 柔紫 · 淡蓝 · 玫粉
- 月亮光晕联动变色

### ⏱️ 睡眠定时器

- 可选 15 / 30 / 45 / 60 / 90 分钟，或持续播放
- 到时前 30 秒自动**渐弱淡出**，不会突然停止吵醒宝宝

### 🎨 视觉效果

- Canvas 实时星空（带闪烁 + 随机流星）
- CSS 月亮（光晕脉动）+ 飘动云朵
- 深色夜空主题，毛玻璃卡片 UI
- 响应式布局，适配手机

---

## 🚀 使用方式

**零依赖，直接打开即可：**

```bash
# 方式一：直接用浏览器打开
open index.html

# 方式二：用任意本地服务器
npx serve .
# 然后访问 http://localhost:3000
```

> 💡 **推荐在手机浏览器中使用**，放在宝宝床头即可。

---

## 📱 哄睡建议

| 场景 | 推荐组合 |
|------|---------|
| 模拟子宫环境 | 粉噪音 + 心跳 |
| 下雨天氛围 | 雨声 + 棕噪音 |
| 温柔入睡 | 小星星 + 海浪（低音量） |
| 深度安抚 | 白噪音 + 心跳 + 定时 30 分钟 |

---

## 🏗️ 项目结构

```
babysleep/
├── index.html   # 页面结构
├── style.css    # 深色主题样式 + 动画
├── app.js       # 音频引擎 + 交互逻辑
└── README.md
```

---

## 🛠️ 技术栈

- **HTML5 / CSS3 / Vanilla JavaScript** — 零框架、零依赖
- **Web Audio API** — `AudioContext`, `OscillatorNode`, `BiquadFilterNode`, `GainNode`
- **Canvas API** — 实时星空动画
- **localStorage** — 记忆用户偏好设置

---

## 📄 License

MIT
