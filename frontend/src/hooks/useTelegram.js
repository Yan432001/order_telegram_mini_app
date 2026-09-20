import { useEffect, useState } from 'react';

function useTelegram() {
  const [tg, setTg] = useState(null);
  const [user, setUser] = useState(null);
  const [initData, setInitData] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const telegram = window.Telegram?.WebApp;
      
      if (telegram) {
        telegram.ready();
        telegram.expand();
        
        setTg(telegram);
        setUser(telegram.initDataUnsafe?.user || null);
        setInitData(telegram.initData || null);
        setIsReady(true);
        
        // Apply theme colors
        const themeParams = telegram.themeParams;
        if (themeParams) {
          const root = document.documentElement;
          if (themeParams.bg_color) {
            root.style.setProperty('--tg-theme-bg-color', themeParams.bg_color);
          }
          if (themeParams.secondary_bg_color) {
            root.style.setProperty('--tg-theme-secondary-bg-color', themeParams.secondary_bg_color);
          }
          if (themeParams.text_color) {
            root.style.setProperty('--tg-theme-text-color', themeParams.text_color);
          }
          if (themeParams.hint_color) {
            root.style.setProperty('--tg-theme-hint-color', themeParams.hint_color);
          }
          if (themeParams.button_color) {
            root.style.setProperty('--tg-theme-button-color', themeParams.button_color);
          }
          if (themeParams.button_text_color) {
            root.style.setProperty('--tg-theme-button-text-color', themeParams.button_text_color);
          }
        }
      } else {
        // Fallback for development outside Telegram
        setIsReady(true);
        console.warn('Telegram WebApp not available - running in development mode');
      }
    } catch (error) {
      console.error('Error initializing Telegram WebApp:', error);
      setIsReady(true); // Still set ready to prevent infinite loading
    }

    return () => {
      if (tg) {
        try {
          tg.close();
        } catch (e) {
          // Ignore close errors
        }
      }
    };
  }, []);

  return { tg, user, initData, isReady };
}

export default useTelegram;