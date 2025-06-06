if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js', {scope: '/'})
      .then(function(registration) {
        console.log('ServiceWorker зарегистрирован успешно:', registration.scope);
      })
      .catch(function(err) {
        console.log('Ошибка регистрации ServiceWorker:', err);
      });
  });
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installButton = document.getElementById('install-button');
  if (installButton) {
    installButton.style.display = 'block';
    installButton.addEventListener('click', () => {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('PWA установлено');
        }
        deferredPrompt = null;
      });
    });
  }
});
