# Devils Cycling Spare ⚔️🔥

**Devils Cycling Spare** is a fast-paced 3D dark-fantasy hack-and-slash action game built using Three.js, Vite, and Electron. Designed with a hybrid desktop/browser architecture, it delivers heavy melee combat, dynamic boss fights, and gamepad haptics both on web browsers and natively on desktop platforms (Steam / Itch.io).

---

## 🎮 Features

* **Visceral Hack-and-Slash Combat:** Multi-hit light attack combo strings, heavy finisher slashes, directional dodging, and hit-stop impact frames.
* **Demonic Rage System:** Fill the fury gauge by parrying and damaging foes to unleash fiery high-damage attacks and temporary immunity.
* **Full Gamepad & Haptics Support:** Native Xbox/PlayStation controller integration via the Web Gamepad API, featuring dual-motor vibration actuators for hit feedback.
* **Cinematic Post-Processing:** High-performance WebGL rendering enhanced with `UnrealBloomPass` emissive glows, atmospheric exponential fog, and dynamic light fields.
* **Glowing Blade Trails:** Real-time buffer ribbon geometry (`MeleeTrail`) generating glowing arc trails for light, heavy, and rage swings.
* **Steam & Cloud Sync:** Built-in integration with `steamworks.js` for native Steam achievements, cloud save file synchronization, and Steam Overlay support.
* **Cross-Platform Installers:** Packaged using Electron Forge with WiX setup wizards (`.msi`), Squirrel auto-updates, and macOS `.dmg` builds.

---

## 🛠 Tech Stack

* **Core Engine:** [Three.js](https://threejs.org/) (WebGL 3D Rendering)
* **Build System:** [Vite](https://vitejs.dev/)
* **Desktop Container:** [Electron](https://www.electronjs.org/) & [Electron Forge](https://www.electronforge.io/)
* **Platform APIs:** `steamworks.js` (Native Steam C++ Bindings) & Web Gamepad API
* **Optimizations:** Draco / Meshopt GLTF compression & `THREE.LoadingManager` shader pre-compilation
* **CI/CD & Deployment:** GitHub Actions (Automated signing, releases, and GitHub Pages web demos)

---

## 🚀 Quick Start (Local Development)

### Prerequisites

* [Node.js](https://nodejs.org/) (v18 or higher)
* [npm](https://www.npmjs.com/)
* *(Optional)* Steam Desktop Client running locally with app ID `480` set in `steam_appid.txt`

### 1. Clone & Install Dependencies

```bash
git clone [https://github.com/YOUR_USERNAME/devils-cycling-spare.git](https://github.com/YOUR_USERNAME/devils-cycling-spare.git)
cd devils-cycling-spare
npm install
