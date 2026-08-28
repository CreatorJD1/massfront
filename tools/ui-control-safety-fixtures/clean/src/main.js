function handleNativeBack(){const a=document.activeElement;if(a&&typeof a.blur==='function')a.blur();}
Capacitor.Plugins.App.addListener('backButton',()=>handleNativeBack());
mfBindTap(document.getElementById('quitBtn'),()=>accConfirm('Abandon?',go));
