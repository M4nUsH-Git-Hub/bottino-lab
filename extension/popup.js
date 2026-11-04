// Bottino Lab · estensione: legge il testo della scheda aperta e lo manda alla scheda di Bottino Lab.
// Legge solo la pagina che hai aperto tu, quando premi il pulsante.
const SITE = 'https://m4nush-git-hub.github.io/bottino-lab/';
const $ = id => document.getElementById(id);
const say = (msg, cls) => { $('status').textContent = msg; $('status').className = cls || ''; };

function waitLoaded(tabId) {
  return new Promise(resolve => {
    const done = () => { chrome.tabs.onUpdated.removeListener(on); setTimeout(resolve, 700); };
    const on = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    chrome.tabs.onUpdated.addListener(on);
    setTimeout(done, 15000);
  });
}

async function send() {
  $('send').disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/.test(tab.url || '')) throw new Error('Apri prima la pagina del quiz o della partita.');
    if ((tab.url || '').startsWith(SITE)) throw new Error('Questa è già Bottino Lab: apri la pagina del quiz o di Sisal.');
    say('Leggo la pagina…');
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const sel = String(getSelection() || '').trim();
        return { text: sel.length > 20 ? sel : document.body.innerText, url: location.href, title: document.title, selection: sel.length > 20 };
      }
    });
    if (!result || !result.text) throw new Error('Non riesco a leggere il testo di questa pagina.');

    let [bl] = await chrome.tabs.query({ url: SITE + '*' });
    if (!bl) {
      bl = await chrome.tabs.create({ url: SITE + '#dati', active: true });
      await waitLoaded(bl.id);
    } else {
      await chrome.tabs.update(bl.id, { active: true });
      await chrome.windows.update(bl.windowId, { focused: true });
    }
    await chrome.scripting.executeScript({
      target: { tabId: bl.id },
      func: payload => window.postMessage({ type: 'bottino-lab-import', payload }, location.origin),
      args: [result]
    });
    say('Inviata a Bottino Lab.', 'ok');
    setTimeout(() => window.close(), 900);
  } catch (e) {
    say(e.message || String(e), 'err');
    $('send').disabled = false;
  }
}
$('send').addEventListener('click', send);
