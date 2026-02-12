import {
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from '@/firebase/config';

export async function loginWithEmail(email: string, password: string): Promise<User> {
  await setPersistence(auth, browserLocalPersistence);
  const credentials = await signInWithEmailAndPassword(auth, email, password);
  return credentials.user;
}

export async function logout(): Promise<void> {
  await signOut(auth);
}
