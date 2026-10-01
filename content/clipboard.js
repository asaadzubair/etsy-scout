// Escout — clipboard handling for text and images.
(function (Escout) {
  async function copyText(text) {
    await navigator.clipboard.writeText(text);
  }

  async function urlToPngBlob(url) {
    const response = await fetch(url, { credentials: 'omit' });
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);

    return new Promise((resolve, reject) => {
      canvas.toBlob((pngBlob) => (pngBlob ? resolve(pngBlob) : reject(new Error('PNG conversion failed'))), 'image/png');
    });
  }

  // The Windows/Chrome OS clipboard is built around holding a single IMAGE
  // at a time — navigator.clipboard.write() technically accepts an array of
  // ClipboardItems, but pasting into a real app (Word, an image editor,
  // chat apps, etc.) only ever yields the first one. Rather than silently
  // dropping every image after the first, we combine every selected
  // listing's featured image into ONE collage PNG and copy that single
  // image — so a paste actually contains all N featured images at once.
  // Each image is placed at its own exact/native pixel dimensions (no
  // cropping and no forced uniform square — every image keeps its real
  // size and aspect ratio), packed left-to-right and wrapped into rows.
  // Nothing is ever downloaded to disk; this is a standard Canvas +
  // Clipboard API composition, not a workaround around any restriction.
  async function buildCompositeImage(pngBlobs) {
    const bitmaps = await Promise.all(pngBlobs.map((blob) => createImageBitmap(blob)));

    const gap = 10;
    const maxRowWidth = 1600; // wrap into a new row instead of one giant strip

    const rows = [];
    let currentRow = [];
    let currentRowWidth = gap;
    bitmaps.forEach((bitmap) => {
      const widthWithGap = bitmap.width + gap;
      if (currentRow.length && currentRowWidth + widthWithGap > maxRowWidth) {
        rows.push(currentRow);
        currentRow = [];
        currentRowWidth = gap;
      }
      currentRow.push(bitmap);
      currentRowWidth += widthWithGap;
    });
    if (currentRow.length) rows.push(currentRow);

    const rowHeights = rows.map((row) => Math.max(...row.map((bitmap) => bitmap.height)));
    const canvasWidth = Math.max(...rows.map((row) => row.reduce((sum, bitmap) => sum + bitmap.width + gap, gap)));
    const canvasHeight = rowHeights.reduce((sum, height) => sum + height + gap, gap);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(canvasWidth);
    canvas.height = Math.round(canvasHeight);

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let y = gap;
    rows.forEach((row, rowIndex) => {
      let x = gap;
      row.forEach((bitmap) => {
        // Drawn at the image's exact real width/height — no cropping, no scaling.
        ctx.drawImage(bitmap, x, y, bitmap.width, bitmap.height);
        x += bitmap.width + gap;
      });
      y += rowHeights[rowIndex] + gap;
    });

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Composite PNG failed'))), 'image/png');
    });
  }

  async function copyImages(urls) {
    const pngBlobs = [];
    for (const url of urls) {
      try {
        pngBlobs.push(await urlToPngBlob(url));
      } catch (e) {
        // Skip images that fail to load/convert rather than aborting the whole batch.
      }
    }

    if (pngBlobs.length === 0) {
      throw new Error('No images could be loaded');
    }

    if (pngBlobs.length === 1) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlobs[0] })]);
      return { loaded: 1, combined: false };
    }

    const composite = await buildCompositeImage(pngBlobs);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': composite })]);
    return { loaded: pngBlobs.length, combined: true };
  }

  Escout.clipboard = { copyText, copyImages };
})(window.Escout = window.Escout || {});
