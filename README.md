# 💬 MERN Stack Real-Time Chat Application

A modern, feature-rich real-time chat application built with the MERN stack, featuring beautiful animations, real-time messaging, and a responsive design.

## ✨ Features

### 🎨 UI/UX Enhancements
-   🌈 **Animated Gradient Background** - Dynamic multi-color gradient with floating orb effects
-   💫 **Glowing LED Border** - Rotating animated neon-style border around chat container
-   📱 **Fully Responsive Design** - Optimized for mobile, tablet, and desktop
-   🎭 **Modern UI** - Built with TailwindCSS + Daisy UI
-   ✍️ **WhatsApp-style Input** - Auto-expanding textarea with Enter to send, Shift+Enter for new line
-   💬 **Responsive Message Bubbles** - Adaptive width (75% on mobile, max-width on larger screens)

### 🚀 Core Features
-   🔐 **Authentication & Authorization** - Secure JWT-based auth system
-   💬 **Real-time Messaging** - Instant message delivery with Socket.io
-   👀 **Message Seen Status** - WhatsApp-style double checkmarks (✓✓)
-   ⌨️ **Typing Indicators** - See when someone is typing in real-time
-   🟢 **Online User Status** - Live presence indicators
-   🔔 **Sound Notifications** - Audio alerts for new messages
-   📊 **Global State Management** - Efficient state handling with Zustand
-   🐞 **Error Handling** - Comprehensive error handling on both client and server

### 📱 Mobile Features
-   🔙 **Back Button Navigation** - Easy navigation between conversations and messages
-   🎯 **Smart Sidebar Toggle** - Automatic view switching on mobile devices
-   📐 **Adaptive Layouts** - Optimized layouts for different screen sizes

## 🛠️ Tech Stack

### Frontend
-   ⚛️ **React** - UI library
-   ⚡ **Vite** - Build tool and dev server
-   🎨 **TailwindCSS** - Utility-first CSS framework
-   🌼 **Daisy UI** - Component library
-   🔌 **Socket.io Client** - Real-time communication
-   📦 **Zustand** - State management
-   🛣️ **React Router** - Navigation

### Backend
-   🟢 **Node.js** - Runtime environment
-   🚂 **Express** - Web framework
-   🔌 **Socket.io** - Real-time bidirectional communication
-   🍃 **MongoDB** - Database
-   🔒 **JWT** - Authentication tokens
-   🔐 **bcryptjs** - Password hashing

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
-   Node.js (v14 or higher)
-   npm or yarn
-   MongoDB account (MongoDB Atlas recommended)

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd mern-chat-app-master
```

### 2. Setup Environment Variables

#### Backend Environment Variables

Create a `.env` file in the root directory:

```env
PORT=5001
MONGO_DB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
NODE_ENV=development
```

**Important:** Replace the values with your own:
-   `MONGO_DB_URI`: Your MongoDB connection string from MongoDB Atlas
-   `JWT_SECRET`: A secure random string for JWT token generation
-   `PORT`: The port number for the server (default: 5001)

#### Frontend Environment Variables (Optional)

Create a `frontend/.env` file if you want to customize the API URL:

```env
VITE_API_URL=http://localhost:5001
```

**Note:** If not specified, the app will default to `http://localhost:5001`

### 3. Install Dependencies

```bash
npm install
```

This will install dependencies for both backend and frontend.

### 4. Build the Application

```bash
npm run build
```

This command will:
-   Install backend dependencies
-   Install frontend dependencies
-   Build the frontend for production

### 5. Start the Application

```bash
npm start
```

The application will be available at `http://localhost:5001`

## 🔧 Development Mode

To run the application in development mode with hot reload:

```bash
# Start backend server with nodemon
npm run server

# In a separate terminal, start frontend dev server
cd frontend
npm run dev
```

## 📁 Project Structure

```
mern-chat-app-master/
├── backend/
│   ├── controllers/      # Request handlers
│   ├── db/              # Database connection
│   ├── middleware/      # Custom middleware
│   ├── models/          # MongoDB models
│   ├── routes/          # API routes
│   ├── socket/          # Socket.io configuration
│   ├── utils/           # Utility functions
│   └── server.js        # Entry point
├── frontend/
│   ├── public/          # Static assets
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── context/     # React context
│   │   ├── hooks/       # Custom hooks
│   │   ├── pages/       # Page components
│   │   ├── utils/       # Utility functions
│   │   └── zustand/     # State management
│   └── index.html       # HTML template
├── .env                 # Environment variables
├── package.json         # Dependencies and scripts
└── README.md           # Documentation
```

## 🎯 Key Features Explained

### Real-time Messaging
Messages are delivered instantly using Socket.io. When a user sends a message, it's immediately broadcast to the recipient without page refresh.

### Typing Indicators
When a user starts typing, other participants in the conversation see a "typing..." indicator in real-time.

### Message Seen Status
Messages show a double checkmark (✓✓) when they've been seen by the recipient, similar to WhatsApp.

### Online Status
Users can see which of their contacts are currently online with a green indicator.

### Responsive Design
The application adapts seamlessly to different screen sizes:
-   **Mobile**: Single-column view with smart navigation
-   **Tablet**: Optimized layouts with adjusted spacing
-   **Desktop**: Full sidebar and message view

### Animated UI
-   Gradient background with smooth color transitions
-   Glowing LED border with rotation animation
-   Floating orb effects for visual depth

## 🔒 Security Features

-   JWT-based authentication
-   Password hashing with bcryptjs
-   Protected routes and API endpoints
-   HTTP-only cookies for token storage
-   Input validation and sanitization

## 🐛 Troubleshooting

### Port Already in Use
If port 5001 is already in use, change the `PORT` in your `.env` file.

### MongoDB Connection Issues
-   Verify your MongoDB connection string
-   Check if your IP is whitelisted in MongoDB Atlas
-   Ensure your database user has proper permissions

### Build Errors
-   Clear node_modules and reinstall: `rm -rf node_modules && npm install`
-   Clear build cache: `npm run build --force`

## 📝 Available Scripts

-   `npm start` - Start production server
-   `npm run server` - Start development server with nodemon
-   `npm run build` - Build frontend and install all dependencies
-   `npm run dev` - Start frontend development server (from frontend directory)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 👨‍💻 Author

Built with ❤️ using the MERN stack

## 🙏 Acknowledgments

-   Socket.io for real-time communication
-   TailwindCSS and Daisy UI for beautiful styling
-   MongoDB for database solutions
-   The MERN stack community

---

**Note:** This is a learning project. For production use, consider additional security measures, error handling, and performance optimizations.


