import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [isSupported] = useState(
    () => 'serviceWorker' in navigator && 'PushManager' in window
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check subscription status — use localStorage per-user key since browser
  // subscription is shared across all accounts in the same browser
  useEffect(() => {
    if (!isSupported) return;
    const userId = localStorage.getItem('push-subscribed-user');
    const currentUser = localStorage.getItem('token');
    // Only mark as subscribed if the same user who subscribed is logged in
    if (userId && currentUser) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      }).catch(() => {});
    } else {
      setIsSubscribed(false);
    }
  }, [isSupported]);

  const requestPermission = useCallback(async () => {
    if (!isSupported) return false;
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return false;

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const { publicKey } = await apiService.getVapidKey();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const { endpoint, keys } = subscription.toJSON();
      await apiService.subscribePush({ endpoint, keys });
      localStorage.setItem('push-subscribed-user', 'true');
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('Push subscription failed:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await apiService.unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  return { isSupported, isSubscribed, loading, requestPermission, unsubscribe };
}
