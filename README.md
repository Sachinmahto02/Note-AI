

## 🛠️ Languages & Tech Stack

This project is built from scratch as a modern full-stack web application leveraging professional and fast technologies.

### Frontend
*   **Language:** TypeScript (v5+) - Type-safe, solid definitions for all data structures.
*   **Core UI Library:** React (v19) - Functional components with custom hooks.
*   **Styling Engine:** Tailwind CSS (v4) - Fluid responsive styling, customized theme properties, custom CSS variables.
*   **Animation Engine:** Framer Motion (`motion/react`) - Staggered modal transitions, hover controls, and element layout shifts.
*   **Specialty Modules:**
    *   `react-markdown` & `rehype-raw` - Perfect, secure live markdown rendering for interactive notes.
    *   `recharts` - Beautiful responsive charts (Bar, Area, and Line charts) for activity heatmaps and mental check-ins.
    *   `jsPDF` - PDF compiler to export active journal reflection documents instantly.

### Backend
*   **Runtime:** Node.js (v22+)
*   **Web Framework:** Express - Handles lightweight server routers, asset loading, and attachment proxies.
*   **Bundling & Development Tooling:** Vite (v6), `esbuild`, `tsx` (TypeScript Execute).

---

## 🗄️ Database Systems & Storage Architecture

This application employs a reliable hybrid storage stack to achieve real-time synchronization, high-speed binary uploads, and bulletproof offline reliability.

### 1. Google Firebase Firestore (Primary Relational Store)
*   **Purpose:** Keeps track of live note templates, categories, task states, calendar schedules, daily streaks, mental health inputs, and text content.
*   **Feature Advantage:** Syncs values near-instantly with active subscriptions, and supports local offline cache fallbacks natively.

### 2. Google Firebase Storage (Media Assets Bucket)
*   **Purpose:** Houses all uploaded images, video loops, audio files, and text attachments.

### 3. MongoDB (High-Speed Proxy Storage Engine)
*   **Purpose:** Leveraged via the server's API upload router `/api/media/upload` to store, manage, and retrieve metadata configurations of custom media files, as well as providing dynamic database fallbacks for items under 700KB.

---

## 🚀 Setting Up & Running the Project in Visual Studio Code (VS Code)

Follow these directions to get the application configured and running on your local computer.

### Prerequisites
Before you start, make sure you have the following programs installed:
1.  **VS Code:** [Download here](https://code.visualstudio.com/)
2.  **Node.js (LTS version 20 or higher recommended):** [Download here](https://nodejs.org/)
3.  **Git:** [Download here](https://git-scm.com/)

---

### Step-by-Step Tutorial

#### Step 1: Open the Project in VS Code
1.  Clone this repository to your machine, or extract the ZIP file containing the workspace.
2.  Launch VS Code, go to the top menu, click **File -> Open Folder...** and select the parent folder of this project.

#### Step 2: Install Mandatory VS Code Extensions (Optional, Recommended)
To enjoy pristine syntax checking and autocomplete, install the following extensions from the VS Code Extensions tab (`Ctrl+Shift+X` or `Cmd+Shift+X`):
*   **ESLint** (By Microsoft)
*   **Prettier - Code formatter** (By Prettier)
*   **Tailwind CSS IntelliSense** (By Tailwind Labs)

#### Step 3: Open an Integrated Terminal
Press ``` Ctrl+` ``` (or **View -> Terminal**) to open the Integrated Terminal panel inside your workspace.

#### Step 4: Configure Environment Credentials
Create a `.env` file at the root of your project directory to store credentials safely:
```env
# .env Configuration Parameters
PORT=3000
NODE_ENV=development

# Google Gemini Core Keys
GEMINI_API_KEY=your_gemini_api_key_here

# MongoDB Backend Setup
MONGODB_URI=mongodb://your_mongo_database_uri_here
```

Ensure your `firebase-applet-config.json` is correctly set up with your Google Firebase configurations.

#### Step 5: Install Project Dependencies
Run the following terminal command at your root terminal:
```bash
npm install
```
This downloads React 19, Google GenAI SDK, Firebase, Express, and development compilers inside the `node_modules` directory.

#### Step 6: Start the Development Server
Execute the developer script in the VS Code terminal:
```bash
npm run dev
```

The terminal will report:
```text
Server running on http://localhost:3000
```
Open [http://localhost:3000](http://localhost:3000) in your web browser to view, interact, edit, and play with your new, fully responsive workspace app!

#### Step 7: Building for Production Deployment
To build the static application and bundle the backend TypeScript server into a streamlined compiled CommonJS executable, run:
```bash
npm run build
```
Once the compilation succeeds, you can run the final server using:
```bash
npm run start
```
This is fully compatible with Cloud Run containers, Heroku, or VPS hosting systems!
