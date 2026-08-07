const albumButtons=[document.getElementById('album-play'),document.getElementById('player-toggle')];
const setPlaying=(value)=>albumButtons.forEach((button)=>button.classList.toggle('is-playing',value));
albumButtons.forEach((button)=>button.addEventListener('click',()=>setPlaying(!button.classList.contains('is-playing'))));
document.querySelector('.album-like').addEventListener('click',(event)=>event.currentTarget.classList.toggle('liked'));
document.querySelectorAll('.track-heart').forEach((button)=>button.addEventListener('click',()=>{button.classList.toggle('liked');button.textContent=button.classList.contains('liked')?'♥':'♡';}));
document.querySelectorAll('.album-tracks li').forEach((track)=>track.addEventListener('dblclick',()=>{document.getElementById('now-title').textContent=track.querySelector('b').textContent;setPlaying(true);}));
