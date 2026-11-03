// The home's own few lines; its instrument is the playground, embedded (/audio/playground/embed.js), whose mark events
// move the header's mark (/bar.js, the site's chrome, with the links' ticks). npm i audio copied.
const $ = s => document.querySelector(s)

// a copy said done on its button for a moment
const install = $('#install')
install.onclick = async () => {
  await navigator.clipboard.writeText('npm i audio')
  install.dataset.label ??= install.innerHTML
  install.textContent = 'Copied'
  clearTimeout(install.timer), install.timer = setTimeout(() => install.innerHTML = install.dataset.label, 1400)
}
