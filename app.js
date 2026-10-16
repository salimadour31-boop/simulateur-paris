'use strict';
// SimuParis — simulateur de paris à argent VIRTUEL. MIT.
const SRC='https://raw.githubusercontent.com/openfootball/football.json/master/';
const LEAGUES=[['en.1','Angleterre — Premier League'],['es.1','Espagne — LaLiga'],['de.1','Allemagne — Bundesliga'],['it.1','Italie — Serie A'],['fr.1','France — Ligue 1']];
const SEASONS=['2024-25','2025-26','2026-27']; // warm-up, backtest, saison en cours
const MARGIN=0.06, START=10000, HOME=0.25, MU=Math.log(1.35), LR=0.06;
const $=s=>document.querySelector(s);
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem('sp_'+k))??d}catch(e){return d}},set:(k,v)=>localStorage.setItem('sp_'+k,JSON.stringify(v))};
let st={bal:LS.get('bal',START),bets:LS.get('bets',[]),simScores:LS.get('sim',{})};
let slip=[],mode='S',view='sport',league='all',DATA={},BT={},liveSim=null;
const save=()=>{LS.set('bal',st.bal);LS.set('bets',st.bets);LS.set('sim',st.simScores)};
const fmt=n=>(Math.round(n*100)/100).toLocaleString('fr-FR');
const sc=m=>{const s=m.score;if(!s)return null;if(Array.isArray(s))return s.length==2?s:null;return s.ft||null};
const ko=m=>new Date(m.date+'T'+(m.time||'15:00').slice(0,5)+':00');
function pois(l,k){let p=Math.exp(-l);for(let i=1;i<=k;i++)p*=l/i;return p}
// probabilités des marchés à partir de deux lambdas (+ score courant optionnel)
function markets(lh,la,g1=0,g2=0){const P={'1':0,'X':0,'2':0,'O':0,'U':0,'BY':0,'BN':0};
 for(let i=0;i<=10;i++)for(let j=0;j<=10;j++){const p=pois(lh,i)*pois(la,j),a=g1+i,b=g2+j;
  P[a>b?'1':a==b?'X':'2']+=p;P[a+b>2.5?'O':'U']+=p;P[a>0&&b>0?'BY':'BN']+=p}return P}
const odd=p=>Math.max(1.01,Math.round(100/(p*(1+MARGIN)))/100);
const LBL={'1':'1','X':'X','2':'2','O':'+2.5','U':'-2.5','BY':'BTTS Oui','BN':'BTTS Non'};
const KEYS=['1','X','2','O','U','BY','BN'];
const GROUPS=[['1','X','2'],['O','U'],['BY','BN']];
function grade(k,a,b){return {'1':a>b,'X':a==b,'2':a<b,'O':a+b>2.5,'U':a+b<2.5,'BY':a>0&&b>0,'BN':!(a>0&&b>0)}[k]}
// Modèle : forces attaque/défense mises à jour après chaque match (descente de gradient Poisson)
function model(){const att={},def={};
 const lam=(h,a)=>[Math.exp(MU+HOME+(att[h]||0)-(def[a]||0)),Math.exp(MU+(att[a]||0)-(def[h]||0))];
 const upd=(h,a,g1,g2)=>{const[l1,l2]=lam(h,a);att[h]=(att[h]||0)+LR*(g1-l1);def[a]=(def[a]||0)-LR*(g1-l1);att[a]=(att[a]||0)+LR*(g2-l2);def[h]=(def[h]||0)-LR*(g2-l2)};
 return{lam,upd}}
async function get(u){try{const r=await fetch(u);return r.ok?(await r.json()).matches||[]:[]}catch(e){return[]}}
async function load(){const all=await Promise.all(LEAGUES.map(([c])=>Promise.all(SEASONS.map(s=>get(SRC+s+'/'+c+'.json')))));LEAGUES.forEach(([c,n],li)=>{const ss=all[li];
 const M=model(),bt=[];
 ss.forEach((ms,si)=>{ms.slice().sort((x,y)=>ko(x)-ko(y)).forEach(m=>{const s=sc(m);if(!s)return;
  if(si==1){const[l1,l2]=M.lam(m.team1,m.team2);bt.push({m,P:markets(l1,l2),s})}
  M.upd(m.team1,m.team2,s[0],s[1])})});
 const cur=(ss[2]||[]).map(m=>{const[l1,l2]=M.lam(m.team1,m.team2);return{...m,lg:c,id:c+'|'+m.date+'|'+m.team1+'|'+m.team2,l1,l2,P:markets(l1,l2)}});
 DATA[c]={name:n,matches:cur};BT[c]=bt})}
const allM=()=>Object.values(DATA).flatMap(d=>d.matches);
const byId=id=>allM().find(m=>m.id==id)||(liveSim&&liveSim.m.id==id?liveSim.m:null);
// ---------- règlement ----------
function result(id){const m=byId(id);if(m){const s=sc(m);if(s)return{s,sim:false}}const x=st.simScores[id];return x?{s:x,sim:true}:null}
function simulate(id){const m=byId(id);if(!m||st.simScores[id])return;const draw=l=>{let k=0,p=Math.exp(-l),u=Math.random(),c=p;while(u>c&&k<15){k++;p*=l/k;c+=p}return k};st.simScores[id]=[draw(m.l1),draw(m.l2)]}
function settle(){let n=0;for(const b of st.bets){if(b.status!='pending')continue;let done=true,win=true,sim=false;
 for(const s of b.sels){const r=result(s.mid);if(!r){done=false;continue}s.score=r.s.join('-');s.sim=r.sim;sim=sim||r.sim;s.res=grade(s.k,r.s[0],r.s[1])?'won':'lost';if(s.res=='lost')win=false}
 if(b.sels.some(s=>s.res=='lost'))done=true;
 if(done){b.status=win?'won':'lost';b.ret=win?b.stake*b.odds:0;b.sim=sim;b.settled=Date.now();st.bal+=b.ret;n++}}save();return n}
function simulatePending(){for(const b of st.bets)if(b.status=='pending')for(const s of b.sels)if(!result(s.mid))simulate(s.mid);settle();render()}
// ---------- coupon ----------
function toggle(m,k){const i=slip.findIndex(s=>s.mid==m.id&&s.k==k);if(i>=0)slip.splice(i,1);else{slip=slip.filter(s=>!(s.mid==m.id&&GROUPS.find(g=>g.includes(k)).includes(s.k)));slip.push({mid:m.id,k,odd:odd(m.P[k]),p:m.P[k],name:m.team1+' – '+m.team2,stake:100})}render()}
function place(){const err=t=>{alert(t)};if(!slip.length)return;
 const bets=[];if(mode=='S'){for(const s of slip){if(!(s.stake>0))return err('Mise invalide');bets.push({sels:[s],stake:+s.stake,odds:s.odd,type:'Simple'})}}
 else{if(slip.length<2)return err('Un combiné demande au moins 2 sélections');if(new Set(slip.map(s=>s.mid)).size<slip.length)return err('Une seule sélection par match dans un combiné');
  const stake=+$('#accStake').value;if(!(stake>0))return err('Mise invalide');bets.push({sels:slip,stake,odds:Math.round(slip.reduce((a,s)=>a*s.odd,1)*100)/100,type:'Combiné ('+slip.length+')'})}
 const tot=bets.reduce((a,b)=>a+b.stake,0);if(tot>st.bal)return err('Solde virtuel insuffisant');
 for(const b of bets){st.bets.push({id:Date.now()+Math.random(),t:Date.now(),status:'pending',...b,sels:b.sels.map(s=>({mid:s.mid,k:s.k,odd:s.odd,p:s.p,name:s.name}))});st.bal-=b.stake}
 slip=[];save();settle();render()}
function renderSlip(){$('#mS').className=mode=='S'?'on':'';$('#mA').className=mode=='A'?'on':'';const B=$('#slipBody');
 if(!slip.length){B.innerHTML='<p class="hd">Cliquez sur une cote pour l\'ajouter.</p>';return}
 let h=slip.map((s,i)=>`<div class="sl">${s.name}<br><b>${LBL[s.k]}</b> @ <b>${s.odd}</b> <span class="hd">(proba. implicite ${(100/s.odd).toFixed(1)} %, modèle ${(s.p*100).toFixed(1)} %)</span>${mode=='S'?`<br>Mise <input type="number" min="1" value="${s.stake}" data-i="${i}" class="stk"> → gain pot. <b>${fmt(s.stake*s.odd)}</b>`:''} <button data-rm="${i}">✕</button></div>`).join('');
 if(mode=='A'){const o=slip.reduce((a,s)=>a*s.odd,1),p=slip.reduce((a,s)=>a*s.p,1);h+=`<div class="sl">Cote combinée <b>${o.toFixed(2)}</b><br>Proba. modèle ${(p*100).toFixed(2)} % — espérance ${((p*o-1)*100).toFixed(1)} % de la mise<br>Mise <input id="accStake" type="number" min="1" value="100"> → gain pot. <b id="accWin">${fmt(100*o)}</b></div>`}
 B.innerHTML=h+'<button id="place" class="on" style="width:100%">Placer le pari (virtuel)</button><p class="note">La marge s\'additionne dans un combiné : plus de sélections = avantage maison plus grand.</p>';
 B.querySelectorAll('.stk').forEach(e=>e.oninput=()=>{slip[e.dataset.i].stake=+e.value;});B.querySelectorAll('.stk').forEach(e=>e.onchange=renderSlip);
 B.querySelectorAll('[data-rm]').forEach(e=>e.onclick=()=>{slip.splice(e.dataset.rm,1);render()});
 const a=$('#accStake');if(a)a.oninput=()=>$('#accWin').textContent=fmt(a.value*slip.reduce((x,s)=>x*s.odd,1));$('#place').onclick=place}
// ---------- vues ----------
function oddCell(m,k,live){const sel=slip.some(s=>s.mid==m.id&&s.k==k);return `<div class="o${sel?' sel':''}${k>'2'&&k!='X'?' x':''}" data-m="${m.id}" data-k="${k}"><i>${LBL[k]}</i><b>${odd(m.P[k]).toFixed(2)}</b><i>${(100/odd(m.P[k])).toFixed(0)} %</i></div>`}
function head(){const mg=g=>((g.reduce((a,k)=>a+1/odd(0.33),0)));return `<div class="m hd"><div>Date</div><div>Match</div>${KEYS.map(k=>`<div class="${k>'2'&&k!='X'?'x':''}" style="text-align:center">${LBL[k]}</div>`).join('')}</div>`}
function matchRow(m){const g=GROUPS.map(g=>(g.reduce((a,k)=>a+1/odd(m.P[k]),0)-1)*100);
 return `<div class="m"><div><small>${m.date.slice(8)}/${m.date.slice(5,7)} ${m.time||''}</small></div><div>${m.team1}<br>${m.team2}<br><small>Marge : 1X2 ${g[0].toFixed(1)} % · O/U ${g[1].toFixed(1)} % · BTTS ${g[2].toFixed(1)} %</small></div>${KEYS.map(k=>oddCell(m,k)).join('')}</div>`}
function vSport(){const now=new Date(),lim=new Date(now-0);let h='';for(const[c]of LEAGUES){if(league!='all'&&league!=c)continue;const d=DATA[c];if(!d)continue;
 const up=d.matches.filter(m=>!sc(m)&&ko(m)>lim).sort((a,b)=>ko(a)-ko(b)).slice(0,league=='all'?6:30);
 h+=`<div class="lg">${d.name}</div>`+(up.length?head()+up.map(matchRow).join(''):'<p class="hd">Aucun match à venir dans les données.</p>')}
 return `<h2>Matchs à venir</h2><p class="hd">Pourcentage sous chaque cote = probabilité implicite (1/cote). La somme dépasse 100 % : c'est la marge (~6 %) — l'avantage de la maison.</p>`+h}
function vLive(){let h='<h2><span class="live">●</span> En direct (simulé)</h2><p class="note">Aucun score réel en direct : la rencontre ci-dessous est SIMULÉE minute par minute (90 min en ~90 s) avec le modèle de Poisson. Les cotes évoluent selon le score et le temps restant.</p>';
 if(!liveSim||liveSim.done){h+='<button id="startLive" class="on">Lancer un match simulé en direct</button>';if(liveSim&&liveSim.done)h+=`<p>Dernier match simulé : ${liveSim.m.team1} ${liveSim.g[0]}-${liveSim.g[1]} ${liveSim.m.team2}</p>`;return h}
 const m=liveSim.m;return h+`<div class="lg"><span class="live">${liveSim.min}'</span> ${m.team1} <b>${liveSim.g[0]} - ${liveSim.g[1]}</b> ${m.team2}</div>`+head()+matchRow(m)}
function startLive(){const c=allM().filter(m=>!sc(m)&&ko(m)>new Date());const b=c[Math.floor(Math.random()*c.length)];if(!b)return;
 const m={...b,id:'live|'+Date.now()+'|'+b.team1+'|'+b.team2,date:new Date().toISOString().slice(0,10),time:'LIVE'};liveSim={m,base:[b.l1,b.l2],min:0,g:[0,0],done:false};
 const tick=()=>{const L=liveSim;L.min++;for(let t=0;t<2;t++)if(Math.random()<L.base[t]/90)L.g[t]++;const r=(90-L.min)/90;L.m.P=markets(L.base[0]*r,L.base[1]*r,L.g[0],L.g[1]);L.m.l1=L.base[0]*r;L.m.l2=L.base[1]*r;
  slip.forEach(s=>{if(s.mid==L.m.id){s.odd=odd(L.m.P[s.k]);s.p=L.m.P[s.k]}});
  if(L.min>=90){L.done=true;st.simScores[L.m.id]=L.g.slice();slip=slip.filter(s=>s.mid!=L.m.id);settle();clearInterval(L.iv)}if(view=='live')render()};
 liveSim.m.P=markets(b.l1,b.l2);liveSim.iv=setInterval(tick,1000);render()}
function vHist(){const pend=st.bets.filter(b=>b.status=='pending').length;
 return `<h2>Historique des paris</h2><button id="simP">Simuler les matchs en attente (${pend} pari(s))</button> <span class="hd">Les paris sont réglés automatiquement dès qu'un résultat réel est publié dans openfootball. Sinon, ce bouton tire un score avec les probabilités du modèle (marqué « simulé »).</span>
 <table><tr><th>Date</th><th>Type</th><th>Sélections</th><th>Mise</th><th>Cote</th><th>Statut</th><th>Retour</th></tr>${st.bets.slice().reverse().map(b=>`<tr><td>${new Date(b.t).toLocaleString('fr-FR')}</td><td>${b.type}</td><td>${b.sels.map(s=>`${s.name} : <b>${LBL[s.k]}</b> @${s.odd}${s.score?` <span class="${s.res}">[${s.score}${s.sim?' simulé':' réel'}]</span>`:''}`).join('<br>')}</td><td>${fmt(b.stake)}</td><td>${b.odds}</td><td class="${b.status}">${{pending:'En attente',won:'Gagné',lost:'Perdu'}[b.status]}${b.sim?' (simulé)':''}</td><td>${b.status=='pending'?'-':fmt(b.ret)}</td></tr>`).join('')}</table>`}
function stats(bets){const s=bets.filter(b=>b.status!='pending');const stk=s.reduce((a,b)=>a+b.stake,0),ret=s.reduce((a,b)=>a+b.ret,0),w=s.filter(b=>b.status=='won').length;
 return{n:s.length,stk,ret,pr:ret-stk,roi:stk?(ret-stk)/stk*100:0,wr:s.length?w/s.length*100:0,ev:s.length?s.reduce((a,b)=>a+b.stake*(b.sels.reduce((x,y)=>x*y.p,1)*b.odds-1),0):0}}
function kpis(S){return `<div class="kp"><div>Paris réglés<b>${S.n}</b></div><div>Total misé<b>${fmt(S.stk)}</b></div><div>Total retourné<b>${fmt(S.ret)}</b></div><div>Bénéfice<b class="${S.pr>=0?'won':'lost'}">${fmt(S.pr)}</b></div><div>ROI<b class="${S.roi>=0?'won':'lost'}">${S.roi.toFixed(1)} %</b></div><div>Taux de réussite<b>${S.wr.toFixed(1)} %</b></div><div>Espérance (modèle)<b class="lost">${fmt(S.ev)}</b></div></div>`}
function vStats(){const S=stats(st.bets);return `<h2>Statistiques</h2>${kpis(S)}<p class="note">« Espérance » = gain moyen attendu selon les probabilités du modèle : négatif à cause de la marge. À long terme, les résultats convergent vers cette valeur.</p><h3>Courbe de bénéfice</h3><canvas id="cv" width="900" height="260"></canvas>`}
function curve(pts){const c=$('#cv');if(!c)return;const x=c.getContext('2d'),W=c.width,H=c.height;x.clearRect(0,0,W,H);const v=[0,...pts];const mn=Math.min(...v,0),mx=Math.max(...v,0),sy=y=>H-10-(y-mn)/((mx-mn)||1)*(H-20);
 x.strokeStyle='#557';x.beginPath();x.moveTo(0,sy(0));x.lineTo(W,sy(0));x.stroke();x.strokeStyle='#4fc3f7';x.lineWidth=2;x.beginPath();v.forEach((y,i)=>{const px=i/(v.length-1||1)*W;i?x.lineTo(px,sy(y)):x.moveTo(px,sy(y))});x.stroke();
 x.fillStyle='#e6eef7';x.fillText('max '+fmt(mx)+'  min '+fmt(mn),8,14)}
function vBT(){return `<h2>Backtest d'une stratégie — saison 2025-26</h2><p class="hd">Mise fixe de 100 DA virtuels sur chaque match passé, avec les cotes que le modèle aurait proposées AVANT le match (données réelles openfootball).</p>
 Ligue <select id="btL"><option value="all">Toutes</option>${LEAGUES.map(([c,n])=>`<option value="${c}">${n}</option>`).join('')}</select>
 Stratégie <select id="btS"><option value="fav">Toujours le favori (1X2)</option><option value="1">Toujours domicile</option><option value="X">Toujours nul</option><option value="2">Toujours extérieur</option><option value="dog">Toujours l'outsider</option><option value="O">Toujours +2.5</option><option value="U">Toujours -2.5</option><option value="BY">Toujours BTTS Oui</option><option value="val">« Value » : cote > 2.0 sur le résultat le plus probable</option></select>
 <button id="btGo" class="on">Lancer</button><div id="btOut"></div>`}
function runBT(){const L=$('#btL').value,S=$('#btS').value;const rows=Object.entries(BT).filter(([c])=>L=='all'||c==L).flatMap(([,r])=>r).sort((a,b)=>ko(a.m)-ko(b.m));const bets=[];
 for(const r of rows){let k=S;const t=['1','X','2'].sort((a,b)=>r.P[b]-r.P[a]);if(S=='fav')k=t[0];if(S=='dog')k=t[2];if(S=='val'){k=t[0];if(odd(r.P[k])<=2)continue}
  const o=odd(r.P[k]),w=grade(k,r.s[0],r.s[1]);bets.push({stake:100,odds:o,ret:w?100*o:0,status:w?'won':'lost',sels:[{p:r.P[k]}]})}
 const S2=stats(bets);let c=0;$('#btOut').innerHTML=(bets.length?kpis(S2):'<p>Aucune donnée.</p>')+'<canvas id="cv" width="900" height="260"></canvas>';curve(bets.map(b=>c+=b.ret-b.stake))}
function vAbout(){return `<h2>À propos</h2><p><b>SimuParis</b> est un simulateur éducatif et libre (licence MIT). Aucun argent réel, aucun lien vers des opérateurs, aucune publicité, aucun traçage : tout est stocké dans votre navigateur (localStorage).</p>
<p><b>Données</b> : calendriers et résultats réels de <a href="https://github.com/openfootball/football.json">openfootball/football.json</a> (domaine public, sans clé API). Les cotes ne sont PAS celles d'un bookmaker.</p>
<p><b>Modèle</b> : chaque équipe a une force d'attaque et de défense, mise à jour après chaque match (régression de Poisson en ligne, avantage domicile ${HOME}). On en tire les probabilités 1X2, +/-2.5 buts et « les deux équipes marquent », puis la cote = 1 / (proba × ${1+MARGIN}). La marge de ${MARGIN*100} % signifie qu'en moyenne, chaque pari perd environ ${(MARGIN/(1+MARGIN)*100).toFixed(1)} % de la mise.</p>
<p><b>Règlement</b> : automatique avec le résultat réel dès qu'il est publié ; sinon, sur demande, un score est tiré au hasard selon le modèle et marqué « simulé ».</p><p>Les paris d'argent réel font perdre en moyenne. Si vous ou un proche avez un problème avec le jeu, parlez-en à un professionnel de santé.</p>`}
function side(){$('#side').innerHTML='<div class="lg">⚽ Football</div><button data-l="all" class="'+(league=='all'?'on':'')+'">Toutes les ligues</button>'+LEAGUES.map(([c,n])=>`<button data-l="${c}" class="${league==c?'on':''}">${n}</button>`).join('')+'<div class="lg">Autres sports</div><p class="hd">Non disponibles (pas de source ouverte fiable).</p>';
 $('#side').querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>{league=b.dataset.l;view='sport';render()})}
function render(){$('#bal').textContent=fmt(st.bal);document.querySelectorAll('nav button').forEach(b=>b.className=b.dataset.v==view?'on':'');side();
 const M=$('#main');M.innerHTML={sport:vSport,live:vLive,hist:vHist,stats:vStats,bt:vBT,about:vAbout}[view]();
 M.querySelectorAll('.o[data-m]').forEach(e=>e.onclick=()=>{const m=byId(e.dataset.m);if(m)toggle(m,e.dataset.k)});
 if(view=='stats'){let c=0;curve(st.bets.filter(b=>b.status!='pending').sort((a,b)=>a.settled-b.settled).map(b=>c+=b.ret-b.stake))}
 if(view=='hist')$('#simP').onclick=simulatePending;if(view=='bt')$('#btGo').onclick=runBT;if(view=='live'&&$('#startLive'))$('#startLive').onclick=startLive;renderSlip()}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.v;render()});
$('#mS').onclick=()=>{mode='S';renderSlip()};$('#mA').onclick=()=>{mode='A';renderSlip()};
$('#reset').onclick=()=>{if(confirm('Réinitialiser solde et historique ?')){st={bal:START,bets:[],simScores:{}};save();render()}};
load().then(()=>{const n=settle();render();window.SP_READY=true;if(n)console.log(n+' pari(s) réglé(s)')});
