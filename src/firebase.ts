import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
    apiKey: 'AIzaSyBycgkpXfqXRvR7xcYpGyDAwwV-G3Zi-Fo',
    authDomain: 'stockiiapp.firebaseapp.com',
    projectId: 'stockiiapp',
    storageBucket: 'stockiiapp.firebasestorage.app',
    messagingSenderId: '1050515511880',
    appId: '1:1050515511880:web:209bbe0ff76f6708f6967d',
    measurementId: 'G-3Y3MJSHVHW',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
