(() => {
  const shareButton = document.getElementById('share-card');
  const dialog = document.getElementById('share-dialog');
  const urlInput = document.getElementById('share-url');
  const status = document.getElementById('share-status');
  // QR, NFC and sharing use the same permanent address, even on previews.
  const url = 'https://sistetecni.com/tarjeta';
  const title = 'Santiago Montañes · Sistetecni';
  const text = 'Santiago Montañes, representante legal de Sistetecni. Computadores y desarrollo de software a medida. Opciones de software para tu negocio desde $30.000 COP mensuales. Local 151, Centro Comercial Intercentro, Bogotá.';

  urlInput.value = url;
  document.getElementById('share-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(title + '\n' + text + '\n' + url);
  // Core contact links work without JavaScript; sharing is an enhancement.
  if (typeof dialog.showModal !== 'function') return;
  const qrDialog = document.getElementById('qr-dialog');
  document.getElementById('show-qr').addEventListener('click', (event) => {
    event.preventDefault();
    qrDialog.showModal();
  });
  document.getElementById('close-qr').addEventListener('click', () => qrDialog.close());
  shareButton.hidden = false;
  shareButton.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({title, text, url});
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }
    status.textContent = '';
    dialog.showModal();
  });
  document.getElementById('close-share').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }});
  urlInput.addEventListener('click', () => urlInput.select());
  document.getElementById('copy-link').addEventListener('click', async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      status.textContent = 'Enlace copiado. Ya puedes compartirlo.';
    } catch {
      urlInput.focus();
      urlInput.select();
      urlInput.setSelectionRange(0, urlInput.value.length);
      status.textContent = 'Selecciona «Copiar» en el enlace o envíalo por WhatsApp.';
    }
  });
})();
