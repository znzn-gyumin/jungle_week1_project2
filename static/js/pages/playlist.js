const playbackButtons=[document.getElementById('playlist-play'),document.getElementById('player-toggle')];
const setPlaying=(value)=>playbackButtons.forEach((button)=>button.classList.toggle('is-playing',value));
playbackButtons.forEach((button)=>button.addEventListener('click',()=>setPlaying(!button.classList.contains('is-playing'))));
document.querySelector('.add-button').addEventListener('click',(event)=>event.currentTarget.classList.toggle('added'));
document.querySelector('.playlist-like').addEventListener('click',(event)=>event.currentTarget.classList.toggle('liked'));
document.getElementById('more-button').addEventListener('click',()=>document.getElementById('more-menu').classList.toggle('open'));
document.querySelectorAll('.playlist-tracks li').forEach((track)=>track.addEventListener('dblclick',()=>{document.getElementById('now-title').textContent=track.querySelector('b').textContent;setPlaying(true);}));
