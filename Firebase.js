// Firebase configuration for Queen Batter Shop App (compat style)
const firebaseConfig = {
  apiKey: "AIzaSyDjwS9GtPf15vNYSNeYZ_2W-e-lcowhw0o",
  authDomain: "batter-shop-app.firebaseapp.com",
  projectId: "batter-shop-app",
  storageBucket: "batter-shop-app.firebasestorage.app",
  messagingSenderId: "729285319910",
  appId: "1:729285319910:web:62822a8bcbac2bd84aaf27"
};

// Initialize Firebase (compat)
firebase.initializeApp(firebaseConfig);

// Initialize Firestore database (compat)
const db = firebase.firestore();
