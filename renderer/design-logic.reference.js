// Reference copy of the design's x-dc script (not loaded by the app). Diff against player.js after a design update.
const BANDS=[60,170,310,600,1000,3000,6000,12000,14000,16000];
const LABELS=['60','170','310','600','1K','3K','6K','12K','14K','16K'];
const PRESETS={Flat:[0,0,0,0,0,0,0,0,0,0],Rock:[5,4,3,1,-1,-1,1,3,4,5],Pop:[-1,2,4,5,3,0,-1,-1,-1,-1],Jazz:[4,3,1,2,-2,-2,0,1,3,4],Classical:[5,4,3,3,-2,-2,0,2,3,4],'Bass Boost':[8,6,4,2,0,0,0,0,0,0],Vocal:[-2,-3,-2,1,4,4,3,1,0,-1],Custom:null};
const THEMES={
  classic:{name:'Classic blue/silver',face:'#d9dde6',faceHi:'#f7f8fb',faceLo:'#a9b0bf',edge:'#5f677a',lcd1:'#2148b8',lcd2:'#0d1f6b',lcdFg:'#e3ebff',lcdDim:'#6b82d4',text:'#1a1f2c',accent:'#2f6df5'},
  graphite:{name:'Dark graphite',face:'#4a4d55',faceHi:'#71757f',faceLo:'#2a2c32',edge:'#121316',lcd1:'#2a2d34',lcd2:'#0e1013',lcdFg:'#e8ebf2',lcdDim:'#5c6170',text:'#f0f2f6',accent:'#a7b2c9'},
  lcd:{name:'Green LCD',face:'#bcc7a8',faceHi:'#e4ead6',faceLo:'#83916d',edge:'#46523a',lcd1:'#aac690',lcd2:'#8faf75',lcdFg:'#15230c',lcdDim:'#5e7a48',text:'#1b2412',accent:'#3d6b28'},
  amber:{name:'Amber',face:'#5c4832',faceHi:'#8d7355',faceLo:'#382a18',edge:'#191107',lcd1:'#2c1805',lcd2:'#150a01',lcdFg:'#ffb531',lcdDim:'#7f5010',text:'#f5e6c8',accent:'#ff9f1a'}
};
const SPEEDS={slow:320,normal:160,fast:70};
const fmt=s=>{s=Math.max(0,Math.floor(s||0));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
class Component extends DCLogic{
  constructor(p){super(p);
    let saved={};try{saved=JSON.parse(localStorage.getItem('flaccer.v1')||'{}')}catch(e){}
    this.state=Object.assign({tracks:[],cur:-1,sel:-1,playing:false,time:0,dur:0,vol:0.8,bal:0,shuffle:false,repeat:false,eqOn:true,preamp:0,gains:BANDS.map(()=>0),preset:'Flat',tab:'eq',theme:'classic',chrome:'classic',dbl:false,remaining:false,scroll:'normal',shade:false,showEq:true,showPl:true,viz:'spectrum',off:0,pinned:false},saved.settings||{},{tracks:(saved.tracks||[]).map((t,i)=>({id:i+1,name:t.name,ext:t.ext||'',dur:t.dur||0,file:null,url:null}))});
    this.nextId=this.state.tracks.length+1;this.pendingRelink=-1;this.peaks=new Array(19).fill(0);
    this.rootRef=React.createRef();this.stackRef=React.createRef();this.fileRef=React.createRef();this.canvasRef=React.createRef();this.listRef=React.createRef();
  }
  componentDidMount(){
    const a=this.audio=new Audio();a.preload='metadata';
    a.addEventListener('timeupdate',()=>this.setState({time:a.currentTime}));
    a.addEventListener('loadedmetadata',()=>{this.setState({dur:a.duration});const t=this.state.tracks[this.state.cur];if(t&&!t.dur){t.dur=a.duration;this.forceUpdate()}});
    a.addEventListener('ended',()=>this.onEnded());
    a.addEventListener('play',()=>this.setState({playing:true}));a.addEventListener('pause',()=>this.setState({playing:false}));
    this.applyDom();this.startTicker();this.raf=requestAnimationFrame(this.draw);
    this.onKey=e=>{if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;if(e.code==='Space'){e.preventDefault();this.playPause()}if(e.key==='ArrowRight')this.next();if(e.key==='ArrowLeft')this.prev();};
    window.addEventListener('keydown',this.onKey);
  }
  componentWillUnmount(){cancelAnimationFrame(this.raf);clearInterval(this.tick);window.removeEventListener('keydown',this.onKey);if(this.audio)this.audio.pause();if(this.ctx)this.ctx.close()}
  componentDidUpdate(_,ps){this.applyDom();if(ps.scroll!==this.state.scroll)this.startTicker();clearTimeout(this.saveT);this.saveT=setTimeout(()=>this.persist(),300)}
  persist(){const s=this.state;const settings={vol:s.vol,bal:s.bal,shuffle:s.shuffle,repeat:s.repeat,eqOn:s.eqOn,preamp:s.preamp,gains:s.gains,preset:s.preset,tab:s.tab,theme:s.theme,chrome:s.chrome,dbl:s.dbl,remaining:s.remaining,scroll:s.scroll,showEq:s.showEq,showPl:s.showPl,viz:s.viz,pinned:s.pinned};
    try{localStorage.setItem('flaccer.v1',JSON.stringify({settings,tracks:s.tracks.map(t=>({name:t.name,ext:t.ext,dur:t.dur}))}))}catch(e){}}
  applyDom(){const r=this.rootRef.current,th=THEMES[this.state.theme]||THEMES.classic;if(r){for(const k of ['face','faceHi','faceLo','edge','lcd1','lcd2','lcdFg','lcdDim','text','accent'])r.style.setProperty('--'+k,th[k]);r.style.background=this.state.theme==='graphite'||this.state.theme==='amber'?'#15161a':'#e9ecf1'}
    if(this.stackRef.current)this.stackRef.current.style.zoom=this.state.dbl?2:1;
    if(this.audio){this.audio.volume=1}
    if(this.gainNode)this.gainNode.gain.value=this.state.vol;else if(this.audio)this.audio.volume=this.state.vol;
    if(this.panNode)this.panNode.pan.value=this.state.bal;
    if(this.filters){this.filters.forEach((f,i)=>f.gain.value=this.state.eqOn?this.state.gains[i]:0);this.pre.gain.value=this.state.eqOn?Math.pow(10,this.state.preamp/20):1}}
  ensureCtx(){if(this.ctx)return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const ctx=this.ctx=new C();
    const src=ctx.createMediaElementSource(this.audio);this.pre=ctx.createGain();
    this.filters=BANDS.map((f,i)=>{const b=ctx.createBiquadFilter();b.type=i===0?'lowshelf':i===BANDS.length-1?'highshelf':'peaking';b.frequency.value=f;b.Q.value=1.2;return b});
    this.analyser=ctx.createAnalyser();this.analyser.fftSize=1024;this.analyser.smoothingTimeConstant=.75;
    this.panNode=ctx.createStereoPanner?ctx.createStereoPanner():null;this.gainNode=ctx.createGain();
    let n=src;n.connect(this.pre);n=this.pre;for(const f of this.filters){n.connect(f);n=f}n.connect(this.analyser);n=this.analyser;if(this.panNode){n.connect(this.panNode);n=this.panNode}n.connect(this.gainNode);this.gainNode.connect(ctx.destination);this.applyDom()}
  startTicker(){clearInterval(this.tick);this.tick=setInterval(()=>{if(this.state.cur>=0)this.setState(s=>({off:s.off+1}))},SPEEDS[this.state.scroll]||160)}
  draw=()=>{this.raf=requestAnimationFrame(this.draw);const c=this.canvasRef.current,r=this.rootRef.current;if(!c||!r)return;const g=c.getContext('2d'),cs=getComputedStyle(r),fg=cs.getPropertyValue('--lcdFg').trim(),dim=cs.getPropertyValue('--lcdDim').trim();const W=c.width,H=c.height;g.clearRect(0,0,W,H);
    if(!this.analyser||!this.state.playing){g.fillStyle=dim;for(let b=0;b<19;b++)g.fillRect(b*4+2,H-2,3,2);if(this.state.viz==='scope'){g.fillRect(0,H/2,W,1)}return}
    if(this.state.viz==='spectrum'){const d=new Uint8Array(this.analyser.frequencyBinCount);this.analyser.getByteFrequencyData(d);
      for(let b=0;b<19;b++){const i0=Math.floor(Math.pow(2,b*9/19)),i1=Math.max(i0+1,Math.floor(Math.pow(2,(b+1)*9/19)));let m=0;for(let i=i0;i<i1;i++)m=Math.max(m,d[i]);const h=Math.round(m/255*(H-2));this.peaks[b]=Math.max(h,this.peaks[b]-.6);
        g.fillStyle=fg;for(let y=0;y<h;y+=2)g.fillRect(b*4+2,H-2-y,3,1);g.fillStyle=fg;g.fillRect(b*4+2,H-3-Math.round(this.peaks[b]),3,1)}}
    else{const d=new Uint8Array(this.analyser.fftSize);this.analyser.getByteTimeDomainData(d);g.fillStyle=fg;const step=d.length/W;for(let x=0;x<W;x++){const v=d[Math.floor(x*step)]/255;g.fillRect(x,Math.round(v*(H-2)),1,2)}}}
  play(i){const s=this.state;if(i===undefined){if(s.cur>=0){this.ensureCtx();this.ctx&&this.ctx.resume();this.audio.play().catch(()=>{});return}i=s.sel>=0?s.sel:0}
    const t=s.tracks[i];if(!t)return;if(!t.file){this.pendingRelink=i;this.fileRef.current.click();return}
    this.ensureCtx();this.ctx&&this.ctx.resume();this.audio.src=t.url;this.audio.play().catch(()=>{});this.setState({cur:i,sel:i,time:0,dur:t.dur||0,off:0})}
  playPause(){if(this.state.playing)this.audio.pause();else this.play()}
  pause(){this.audio.pause()}
  stop(){this.audio.pause();this.audio.currentTime=0;this.setState({time:0})}
  step(d){const s=this.state,n=s.tracks.length;if(!n)return;let i;if(s.shuffle&&n>1){do{i=Math.floor(Math.random()*n)}while(i===s.cur)}else i=(s.cur+d+n)%n;this.play(i)}
  next(){this.step(1)}prev(){if(this.audio.currentTime>3){this.audio.currentTime=0;return}this.step(-1)}
  onEnded(){const s=this.state;if(s.repeat&&!s.shuffle&&s.tracks.length===1){this.audio.currentTime=0;this.audio.play();return}
    if(!s.shuffle&&!s.repeat&&s.cur===s.tracks.length-1){this.setState({playing:false});return}this.step(1)}
  addFiles(list){const files=Array.from(list||[]).filter(f=>f.type.startsWith('audio/')||/\.(flac|mp3|ogg|wav|m4a|aac|opus)$/i.test(f.name));if(!files.length)return;
    const tracks=this.state.tracks.slice();let first=-1;
    files.forEach((f,k)=>{const name=f.name.replace(/\.[^.]+$/,''),ext=(f.name.split('.').pop()||'').toUpperCase(),url=URL.createObjectURL(f);
      let idx=-1;if(this.pendingRelink>=0&&files.length===1)idx=this.pendingRelink;else idx=tracks.findIndex(t=>!t.file&&t.name===name);
      if(idx>=0){tracks[idx]=Object.assign({},tracks[idx],{file:f,url,ext,name});}else{tracks.push({id:this.nextId++,name,ext,dur:0,file:f,url});idx=tracks.length-1}
      if(first<0)first=idx;const t=tracks[idx];if(!t.dur){const a=new Audio();a.preload='metadata';a.src=url;a.addEventListener('loadedmetadata',()=>{t.dur=a.duration;this.forceUpdate()})}});
    const relink=this.pendingRelink;this.pendingRelink=-1;
    this.setState({tracks},()=>{if(relink>=0||this.state.cur<0)this.play(first)})}
  setGain(i,v){const gains=this.state.gains.slice();gains[i]=v;this.setState({gains,preset:'Custom'})}
  componentWillReceiveProps(np){const u={};if(np.theme&&np.theme!==this.props.theme)u.theme=np.theme;if(np.chrome&&np.chrome!==this.props.chrome)u.chrome=np.chrome;if(np.doubleSize!==undefined&&np.doubleSize!==this.props.doubleSize)u.dbl=!!np.doubleSize;if(Object.keys(u).length)this.setState(u)}
  renderVals(){const s=this.state,cur=s.tracks[s.cur],dur=s.dur||(cur&&cur.dur)||0;
    const on='var(--accent)',off='var(--faceLo)',led=c=>c?on:off,lcd=c=>c?'var(--lcdFg)':'var(--lcdDim)';
    const title=cur?`${s.cur+1}. ${cur.name}${cur.dur?' ('+fmt(cur.dur)+')':''}`:'FLACCER - DROP AUDIO FILES HERE';
    const loop=title+'   ***   ';const mq=(n)=>{if(title.length<=n&&!cur)return title.padEnd(n);const o=s.off%loop.length;return (loop+loop).slice(o,o+n)};
    const timeStr=(s.remaining&&dur?'-':'')+fmt(s.remaining&&dur?dur-s.time:s.time);
    const total=s.tracks.reduce((a,t)=>a+(t.dur||0),0);
    return{
      rootRef:this.rootRef,stackRef:this.stackRef,fileRef:this.fileRef,canvasRef:this.canvasRef,listRef:this.listRef,
      macChrome:s.chrome==='mac',classicChrome:s.chrome!=='mac',shade:s.shade,notShade:!s.shade,pinGlyph:s.pinned?'📌':'',
      timeStr,statusGlyph:s.playing?'►':cur?'▌▌':'■',statusStr:s.playing?'PLAYING':cur?'PAUSED':'STOPPED',marquee:mq(29),marqueeShort:mq(22),
      extStr:cur?(cur.ext||'AUDIO'):'FLAC',kbpsStr:cur&&cur.file&&cur.dur?String(Math.round(cur.file.size*8/cur.dur/1000)):'---',khzStr:this.ctx?String(Math.round(this.ctx.sampleRate/1000)):'--',chanStr:'STEREO',
      shuffleLcd:lcd(s.shuffle),repeatLcd:lcd(s.repeat),eqLcd:lcd(s.eqOn),
      seekMax:dur||1,time:s.time,seekPct:(dur?Math.round(s.time/dur*100):0)+'%',onSeek:e=>{const v=+e.target.value;this.audio.currentTime=v;this.setState({time:v})},
      vol:s.vol,volPct:Math.round(s.vol*100)+'%',onVol:e=>this.setState({vol:+e.target.value}),bal:s.bal,onBal:e=>this.setState({bal:+e.target.value}),centerBal:()=>this.setState({bal:0}),
      play:()=>this.play(),pause:()=>this.pause(),stop:()=>this.stop(),next:()=>this.next(),prev:()=>this.prev(),playPause:()=>this.playPause(),playGlyph:s.playing?'▌▌':'►',
      openFiles:()=>{this.pendingRelink=-1;this.fileRef.current.click()},onFiles:e=>{this.addFiles(e.target.files);e.target.value=''},
      onDragOver:e=>{e.preventDefault()},onDrop:e=>{e.preventDefault();this.pendingRelink=-1;this.addFiles(e.dataTransfer.files)},
      toggleShade:()=>this.setState({shade:!s.shade}),toggleDbl:()=>this.setState({dbl:!s.dbl}),togglePin:()=>this.setState({pinned:!s.pinned}),toggleRemaining:()=>this.setState({remaining:!s.remaining}),toggleViz:()=>this.setState({viz:s.viz==='spectrum'?'scope':'spectrum'}),
      toggleShuffle:()=>this.setState({shuffle:!s.shuffle}),toggleRepeat:()=>this.setState({repeat:!s.repeat}),shuffleLed:led(s.shuffle),repeatLed:led(s.repeat),
      toggleEqWin:()=>this.setState({showEq:!s.showEq}),togglePlWin:()=>this.setState({showPl:!s.showPl}),eqWinLed:led(s.showEq),plWinLed:led(s.showPl),showEqWin:s.showEq,showPlWin:s.showPl,
      openOptions:()=>this.setState({showEq:true,tab:'options'}),openThemes:()=>this.setState({showEq:true,tab:'themes'}),
      tabEq:()=>this.setState({tab:'eq'}),tabThemes:()=>this.setState({tab:'themes'}),tabOptions:()=>this.setState({tab:'options'}),
      isEqTab:s.tab==='eq',isThemesTab:s.tab==='themes',isOptionsTab:s.tab==='options',
      tabEqBg:s.tab==='eq'?'linear-gradient(var(--face),var(--faceHi))':'linear-gradient(var(--faceLo),var(--face))',tabThemesBg:s.tab==='themes'?'linear-gradient(var(--face),var(--faceHi))':'linear-gradient(var(--faceLo),var(--face))',tabOptionsBg:s.tab==='options'?'linear-gradient(var(--face),var(--faceHi))':'linear-gradient(var(--faceLo),var(--face))',
      toggleEqOn:()=>this.setState({eqOn:!s.eqOn}),eqLed:led(s.eqOn),resetEq:()=>this.setState({gains:BANDS.map(()=>0),preamp:0,preset:'Flat'}),
      preset:s.preset,presets:Object.keys(PRESETS),onPreset:e=>{const p=PRESETS[e.target.value];this.setState(p?{preset:e.target.value,gains:p.slice()}:{preset:'Custom'})},
      preamp:s.preamp,preampStr:(s.preamp>0?'+':'')+s.preamp,onPreamp:e=>this.setState({preamp:+e.target.value}),resetPreamp:()=>this.setState({preamp:0}),
      bands:BANDS.map((f,i)=>({label:LABELS[i],gain:s.gains[i],gainStr:(s.gains[i]>0?'+':'')+s.gains[i],onChange:e=>this.setGain(i,+e.target.value),reset:()=>this.setGain(i,0)})),
      themes:Object.keys(THEMES).map(k=>Object.assign({},THEMES[k],{led:led(s.theme===k),select:()=>this.setState({theme:k})})),
      setChromeClassic:()=>this.setState({chrome:'classic'}),setChromeMac:()=>this.setState({chrome:'mac'}),chromeClassicLed:led(s.chrome!=='mac'),chromeMacLed:led(s.chrome==='mac'),
      setElapsed:()=>this.setState({remaining:false}),setRemaining:()=>this.setState({remaining:true}),elapsedLed:led(!s.remaining),remainingLed:led(s.remaining),
      setScrollSlow:()=>this.setState({scroll:'slow'}),setScrollNormal:()=>this.setState({scroll:'normal'}),setScrollFast:()=>this.setState({scroll:'fast'}),scrollSlowLed:led(s.scroll==='slow'),scrollNormalLed:led(s.scroll==='normal'),scrollFastLed:led(s.scroll==='fast'),
      dblLed:led(s.dbl),pinLed:led(s.pinned),
      isEmpty:!s.tracks.length,emptyMsg:'Drop audio files here\nor press + ADD',
      tracks:s.tracks.map((t,i)=>({num:(i+1)+'.',label:t.name+(t.file?'':'  (click ► to relink)'),durStr:t.dur?fmt(t.dur):'--:--',
        color:i===s.cur?'var(--lcd2)':t.file?'var(--lcdFg)':'var(--lcdDim)',bg:i===s.cur?'var(--lcdFg)':i===s.sel?'rgba(255,255,255,.18)':'transparent',
        select:()=>this.setState({sel:i}),play:()=>this.play(i)})),
      removeSel:()=>{if(s.sel<0)return;const tracks=s.tracks.filter((_,i)=>i!==s.sel);let cur=s.cur;if(s.sel===s.cur){this.stop();this.audio.removeAttribute('src');cur=-1}else if(s.sel<s.cur)cur--;this.setState({tracks,cur,sel:Math.min(s.sel,tracks.length-1),dur:cur<0?0:s.dur})},
      clearAll:()=>{this.stop();this.audio.removeAttribute('src');this.setState({tracks:[],cur:-1,sel:-1,dur:0,time:0})},
      plTotals:`${fmt(s.time)} / ${fmt(total)}`
    }}
}
