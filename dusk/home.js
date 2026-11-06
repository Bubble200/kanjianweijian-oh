// Create the canvas only on the homepage; stop its work during a conversation.
const home=document.querySelector('#home-view');
const layer=document.querySelector('.dusk-backdrop');
function updateBackground(){
 if(home.hidden||document.hidden){layer.replaceChildren();return;}
 if(layer.firstElementChild)return;
 const frame=document.createElement('iframe');
 frame.src='dusk/index.html';
 frame.title='水彩背景';
 frame.tabIndex=-1;
 layer.append(frame);
}
new MutationObserver(updateBackground).observe(home,{attributes:true,attributeFilter:['hidden']});
document.addEventListener('visibilitychange',updateBackground);
updateBackground();
