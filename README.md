# 💸 Xpentrik - Personal Expense Tracker

A beautiful, dark-themed mobile expense tracking app built with React Native and Expo. Features automatic SMS parsing to extract expenses from bank transaction messages.

![Xpentrik](https://img.shields.io/badge/Platform-iOS%20%7C%20Android-blue) ![Expo](https://img.shields.io/badge/Expo-SDK%2050-black) ![License](https://img.shields.io/badge/License-Personal%20Use-green)

## ✨ Features

### 📱 Core Features
- **Manual Expense Entry** - Quick and easy expense logging with categories
- **SMS Auto-Read** (Android) - Automatically extracts expenses from bank SMS messages
- **SMS Paste** (iOS/Android) - Paste bank messages to auto-extract transaction details
- **Category Management** - 10 pre-built categories with icons and colors
- **Budget Tracking** - Set monthly budgets and track progress

### 📊 Analytics
- **Weekly Overview** - Visual bar chart of daily spending
- **Category Breakdown** - See where your money goes
- **Quick Insights** - Top spending category, daily average, transaction count
- **Period Filtering** - View by week, month, or year

### 🎨 Design
- **Dark Luxe Theme** - Beautiful dark mode interface
- **Vibrant Accents** - Orange primary with cyan secondary colors
- **Smooth Animations** - Polished user experience
- **Responsive Layout** - Works on all screen sizes

## 🏦 Supported Banks & Payment Apps (SMS Parsing)

The SMS parser recognizes messages from:
- **Banks**: HDFC, ICICI, SBI, Axis, Kotak, PNB, BOI, Canara, Union, IOB, Yes Bank, IndusInd
- **Payment Apps**: GPay, PhonePe, Paytm, Amazon Pay, CRED, Slice, LazyPay, Simpl, BharatPe, MobiKwik

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- Expo Go app on your phone (for testing)

### Installation

1. **Clone the repository**
   ```bash
   cd Xpentrik
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Add app icons** (required for build)
   
   Add the following images to the `assets/` folder:
   - `icon.png` - 1024x1024 app icon
   - `splash.png` - 1284x2778 splash screen
   - `adaptive-icon.png` - 1024x1024 Android adaptive icon
   - `favicon.png` - 48x48 web favicon
   - `notification-icon.png` - 96x96 notification icon

4. **Start the development server**
   ```bash
   npm start
   ```

5. **Run on your device**
   - Scan the QR code with Expo Go (Android)
   - Scan with Camera app (iOS)

### Building for Production

For a standalone app with full SMS reading capabilities (Android):

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios
```

## 📁 Project Structure

```
Xpentrik/
├── App.js                 # Main app entry with navigation
├── app.json              # Expo configuration
├── package.json          # Dependencies
├── babel.config.js       # Babel configuration
├── assets/               # App icons and images
└── src/
    ├── components/       # Reusable UI components
    │   ├── ExpenseCard.js
    │   ├── CategoryPicker.js
    │   ├── StatCard.js
    │   └── AddExpenseModal.js
    ├── screens/          # App screens
    │   ├── HomeScreen.js
    │   ├── AnalyticsScreen.js
    │   └── SettingsScreen.js
    ├── services/         # Business logic
    │   └── smsService.js
    ├── utils/            # Utilities
    │   ├── storage.js    # AsyncStorage operations
    │   └── smsParser.js  # SMS parsing logic
    └── theme/            # Styling
        └── colors.js     # Color palette
```

## 🔧 Configuration

### Monthly Budget
Set your monthly budget in Settings → Monthly Budget

### SMS Auto-Read (Android Only)
1. Go to Settings
2. Enable "Auto-read SMS"
3. Grant SMS permission when prompted
4. Pull down on Home screen to sync new messages

### Manual SMS Entry (All Platforms)
1. Tap + button on Home screen
2. Select "Paste SMS" tab
3. Paste your bank transaction SMS
4. App will automatically extract the amount and details

## 📝 SMS Format Examples

The parser handles various Indian bank SMS formats:

```
Rs.499.00 debited from A/c XX1234 on 06-Jan-25. UPI:SWIGGY. Avl Bal:Rs.15,234.50

INR 1,500 spent on HDFC Credit Card XX5678 at Amazon on 06-Jan-25

Paid Rs.150 to Uber via UPI. UPI Ref: 123456789012
```

## 🔒 Privacy

- **All data stored locally** on your device
- **No cloud sync** - your financial data never leaves your phone
- **SMS permission** only used to read transaction messages
- **No analytics or tracking** - completely private

## 🛠️ Tech Stack

- **React Native** - Cross-platform mobile framework
- **Expo** - Development platform and tooling
- **AsyncStorage** - Local data persistence
- **React Navigation** - Screen navigation
- **date-fns** - Date manipulation
- **expo-linear-gradient** - Gradient backgrounds

## 📄 License

This project is for personal use only.

---

Made with 💜 for personal expense tracking
