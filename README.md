# Meet-Mind 🧠

A complete authentication system for the Meet-Mind mobile app built with **React Native (Expo)** and **FastAPI (Python)** with **PostgreSQL**.

## Features

- ✅ Email/Password Signup & Login
- ✅ Google OAuth (Firebase) integration
- ✅ JWT authentication with protected routes
- ✅ Password hashing with bcrypt
- ✅ Clean, professional dark-themed UI
- ✅ Animated screens with smooth transitions
- ✅ Password strength indicator
- ✅ Form validation (client & server)
- ✅ Auto-login with stored JWT token

---

## Project Structure

```
meet-mind/
├── frontend/          # React Native Expo app
│   ├── App.js
│   ├── src/
│   │   ├── screens/
│   │   │   ├── LoginScreen.js
│   │   │   ├── SignupScreen.js
│   │   │   └── HomeScreen.js
│   │   ├── navigation/
│   │   │   └── AppNavigator.js
│   │   ├── services/
│   │   │   └── api.js
│   │   └── utils/
│   │       └── storage.js
│   └── package.json
│
├── backend/           # FastAPI Python server
│   ├── main.py
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── config.py
│       ├── database.py
│       ├── models.py
│       ├── schemas.py
│       ├── auth.py
│       ├── dependencies.py
│       └── routers/
│           └── auth.py
│
└── README.md
```

---

## Prerequisites

- **Python** 3.10+
- **Node.js** 18+
- **PostgreSQL** 14+
- **Expo CLI** (installed globally or via npx)

---

## Backend Setup

### 1. Create PostgreSQL Database

```bash
# Open psql shell
psql -U postgres

# Create database
CREATE DATABASE meetmind;
\q
```

### 2. Configure Environment

```bash
cd backend

# Copy the example env file
cp .env.example .env

# Edit .env with your database credentials
# DATABASE_URL=postgresql+asyncpg://postgres:YOUR_PASSWORD@localhost:5432/meetmind
# JWT_SECRET=generate-a-strong-random-secret-here
```

### 3. Create Virtual Environment & Install Dependencies

```bash
# Create venv
python -m venv venv

# Activate venv (Windows)
venv\Scripts\activate

# Activate venv (macOS/Linux)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 4. Run the Backend Server

```bash
python main.py

# Or using uvicorn directly
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

📖 **Swagger Docs**: `http://localhost:8000/docs`

---

## Frontend Setup

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Configure API URL

Edit `frontend/src/services/api.js`:

```javascript
// For Android emulator → host machine
const BASE_URL = "http://10.0.2.2:8000";

// For iOS simulator or web
// const BASE_URL = "http://localhost:8000";

// For physical device (use your machine's local IP)
// const BASE_URL = "http://192.168.x.x:8000";
```

### 3. Run the App

```bash
npx expo start

# Then press:
# 'a' for Android emulator
# 'i' for iOS simulator
# 'w' for web browser
```

---

## API Endpoints

| Method | Endpoint           | Description          | Auth Required |
|--------|--------------------|----------------------|---------------|
| POST   | `/api/auth/signup`  | Register new user    | No            |
| POST   | `/api/auth/login`   | Login with email/pw  | No            |
| POST   | `/api/auth/google`  | Google OAuth login   | No            |
| GET    | `/api/auth/me`      | Get user profile     | Yes (Bearer)  |
| GET    | `/`                 | Health check         | No            |

### Example Requests

**Signup:**
```json
POST /api/auth/signup
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepass123"
}
```

**Login:**
```json
POST /api/auth/login
{
  "email": "john@example.com",
  "password": "securepass123"
}
```

**Google Auth:**
```json
POST /api/auth/google
{
  "email": "john@gmail.com",
  "name": "John Doe",
  "uid": "firebase-uid-123"
}
```

---

## Google OAuth Setup (Optional)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use existing
3. Enable **Google sign-in** under Authentication → Sign-in method
4. For Expo, use `expo-auth-session` with Google provider
5. Send the Google user's `email`, `name`, and Firebase `uid` to `POST /api/auth/google`

---

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | React Native, Expo, React Navigation |
| Backend   | FastAPI, SQLAlchemy, Uvicorn        |
| Database  | PostgreSQL (asyncpg)                |
| Auth      | JWT (python-jose), bcrypt (passlib) |
| Storage   | AsyncStorage (React Native)         |

---

## License

MIT