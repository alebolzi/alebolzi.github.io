'use strict';
/* ============================================================
   /data — configurazione centrale: ogni parametro dell'algoritmo è qui.
   Il profilo è una barra unica 1–10 (sicurezza ↔ rischio); la UI usa 1
   per la massima sicurezza e 10 per il massimo rischio. Il motore conserva
   internamente la convenzione inversa per compatibilità con le formule.
   Il PAC non è un input: è la capacità di risparmio consigliata (90%),
   usata nella sezione «Piano PAC vs redistribuzione immediata».
   ============================================================ */
const CONFIG = {
  tasse:   { plusvalenze: 0.26 },
  costi:   { commissionePct: 0.001, commissioneMin: 2 },
  emergenza:{ mesiBase: 3, pesoStabilita: 0.6, pesoProfilo: 0.2, mesiMin: 3, mesiMax: 12 },
  cassa:   { mesiOperativi: 1, min: 1000, max: 4000 },
  orizzonte:{ breveMesi: 36, medioMesi: 60 },
  bande:   { tolleranza: 0.03, moderata: 0.08, ticketMinimo: 250, ticketMinPac: 50 },
  crescita: { base: 0.10, ampiezza: 0.90, curva: 1.15 },
  giovane: { etaLimite: 40, boostPerAnno: 0.025 },
  prudenza:{ etaVecchia: 60, profiloPrudente: 7, maxCrescita: 0.30 },
  crypto:  { base: 0.02, pendenza: 0.28, curva: 1.6, massimo: 0.30,
             baseEta: 0.05, coefsEta: 0.005,
             broCap: 0.50, broBoost: 0.20,
             tabellaProfilo: {1:.30,2:.30,3:.22,4:.22,5:.15,6:.15,7:.08,8:.08,9:.04,10:.04} },
  pac:     { bufferPct: 0.10, arrotondaA: 10, sogliaAnni: 3, costoSogliaEur: 2000, venditaCostoMinPct: 0.10, venditaCostoMaxPct: 0.26 },
  rendimenti: { cash:0.01, deposit:0.02, bond:0.05, etf:0.08, risk:0.17 },
  rendInfo: { cash:'0%', deposit:'1–3%', bond:'3–5%', etf:'6–10%', risk:'0–30%' },
  drawdown: { cash:0, deposit:0.005, bond:0.12, etf:0.50, risk:0.85 },
  proiezione: { anni:30, inflazione:0.02, milestones:[5,10,20,30] },
  volatilita: { cash: 0.5, deposit: 1.5, bond: 5, etf: 17, risk: 70 },
  rischioPort: { scala: 4.0, penalitaConcMax: 10 },
  vendite: { penalitaFiscaleSconosciuta: 0.08 },
  stress: [
    { id:'s1', label:'Correzione',         sub:'azionario −10% · rischiosi −25%', shocks:{etf:-.10, risk:-.25, bond:-.02, deposit:0, cash:0} },
    { id:'s2', label:'Mercato ribassario', sub:'azionario −30% · rischiosi −50%', shocks:{etf:-.30, risk:-.50, bond:-.08, deposit:0, cash:0} },
    { id:'s3', label:'Crypto winter',      sub:'rischiosi −70% · azionario −5%',  shocks:{etf:-.05, risk:-.70, bond:0, deposit:0, cash:0} },
    { id:'s4', label:'Crisi severa',       sub:'azionario −50% · rischiosi −70%', shocks:{etf:-.50, risk:-.70, bond:-.20, deposit:0, cash:0} },
  ],
  cryptoModeLabel: { no:'No crypto (azzerata)', std:'Standard (modello decide)', bro:'Crypto bro (enfatizzata)' },
};
const PILLARS = [
  { k:'cash',    breve:'Cash',     nome:'Conto corrente + carte', icon:'wallet',      c:'var(--c1)' },
  { k:'deposit', breve:'Deposito', nome:'Conto deposito',         icon:'piggy-bank',  c:'var(--c2)' },
  { k:'bond',    breve:'Bond',     nome:'Bond',                   icon:'shield',      c:'var(--c3)' },
  { k:'etf',     breve:'Stocks',   nome:'ETF azionari (stocks)',  icon:'trending-up', c:'var(--c4)' },
  { k:'risk',    breve:'Crypto',   nome:'Crypto + rischiosi',     icon:'bitcoin',     c:'var(--c5)' },
];
const Pk = Object.fromEntries(PILLARS.map(p=>[p.k,p]));
const PILLAR_HELP = {
  cash:'Liquidità subito spendibile: conto corrente, carte, contanti.',
  deposit:'Denaro fermo che rende un po\u2019: conto deposito, salvadanai, libretti.',
  bond:'Titoli di Stato e obbligazioni, anche dentro fondi o polizze.',
  etf:'ETF e fondi azionari sulle borse del mondo: la crescita a lungo termine.',
  risk:'Crypto, azioni singole, oro cartaceo, strumenti speculativi: massima volatilità.',
};
const REND_NOTE = {
  cash:'Rendimento nullo per costruzione: serve a operare, non a crescere.',
  deposit:'Tassi tipici dei conti deposito: protezione dall\u2019inflazione parziale.',
  bond:'Cedole e rivalutazione: la componente stabilizzatrice del portafoglio.',
  etf:'Rendimento storico di lungo periodo dell\u2019azionario globale, con forti oscillazioni annue.',
  risk:'Range teorico estremo: può perdere gran parte del valore in un ciclo e recuperare altrettanto.',
};
const TICKER_DB = {
  VWCE:{area:'Globale'}, SWRD:{area:'Globale'}, IWDA:{area:'Globale'}, ACWI:{area:'Globale'},
  CSPX:{area:'USA'}, VUAA:{area:'USA'}, VUSA:{area:'USA'}, SXR8:{area:'USA'},
  EIMI:{area:'Emergenti'}, EMIM:{area:'Emergenti'}, MEUD:{area:'Europa'}, IMAE:{area:'Europa'},
  BTP:{area:'Italia'}, XLKE:{area:'Europa'},
};
const CRYPTO_TOKENS = ['bitcoin','btc','ethereum','eth','solana','crypto','xrp','ripple','dogecoin','doge','cardano','altcoin','defi','nft'];
const isCryptoName = n => CRYPTO_TOKENS.some(t=>String(n).toLowerCase().includes(t));
const DEST = { immediato:'Conto corrente / deposito', breve:'Conto deposito', medio:'Bond', lungo:'Capitale investibile a lungo termine' };
/* zone della barra profilo: da sinistra (stabilità) a destra (rendimento).
   col = il colore UNICO con cui si riempie la barra quando questa zona è attiva */
const BP_ZONES = [
  {name:'Molto prudente',   icon:'lock',        col:'#22694F', desc:'Priorità assoluta alla conservazione: volatilità minima, crescita minima.'},
  {name:'Prudente',         icon:'shield',      col:'#3E5C76', desc:'Capitale protetto, con una piccola quota dedicata alla crescita.'},
  {name:'Bilanciato',       icon:'scale',       col:'#8A6642', desc:'Equilibrio dichiarato tra sicurezza del capitale e rendimento.'},
  {name:'Aggressivo',       icon:'trending-up', col:'#A9812B', desc:'La crescita è protagonista: servi gli anni pieni di oscillazioni.'},
  {name:'Molto aggressivo', icon:'rocket',      col:'#AE4A2C', desc:'Massima crescita accettando massima volatilità e drawdown profondi.'},
];

/* ============================================================
   /data — scenari precompilabili (prof = barra unica 1–10)
   ============================================================ */
const PRESETS = [
  { id:'bilanciato', nome:'Bilanciato', icon:'scale',
    desc:'Il portafoglio d\u2019esempio: un po\u2019 di tutto, con squilibri realistici da correggere.',
    prof:{eta:32,avv:5,cm:'std'},
    pil:{cash:4000,deposit:8000,bond:6000,etf:20000,risk:15000},
    det:{bond:[['BTP Italia 2031','BTP',6000,'']],etf:[['Vanguard FTSE All-World','VWCE',20000,15500]],risk:[['Bitcoin','',12000,9000],['Tesla','TSLA',3000,'']]} },
  { id:'banca', nome:'Tutto in banca', icon:'landmark',
    desc:'€60.000 fermi sul conto corrente: il classico caso di liquidità in eccesso.',
    prof:{eta:41,avv:6,cm:'std'},
    pil:{cash:60000} },
  { id:'bond', nome:'Solo bond', icon:'shield',
    desc:'100% titoli di Stato: massima sicurezza, crescita probabilmente insufficiente.',
    prof:{eta:58,avv:8,cm:'std'},
    pil:{bond:60000},
    det:{bond:[['BTP Italia 2031','BTP',35000,''],['BTP Italia 2039','BTP',25000,'']]} },
  { id:'azionario', nome:'Solo azionario', icon:'trending-up',
    desc:'100% ETF azionario globale: crescita piena, zero stabilità intermedia.',
    prof:{eta:30,avv:3,cm:'std'},
    pil:{etf:60000},
    det:{etf:[['Vanguard FTSE All-World','VWCE',42000,30000],['iShares Core MSCI EM','EIMI',18000,14000]]} },
  { id:'crypto', nome:'Solo crypto', icon:'bitcoin',
    desc:'100% crypto: il caso estremo. Guarda cosa dice lo stress test.',
    prof:{eta:26,avv:1,cm:'bro'},
    pil:{risk:60000},
    det:{risk:[['Bitcoin','',35000,20000],['Ethereum','',25000,18000]]} },
  { id:'super', nome:'Super rischio', icon:'rocket',
    desc:'Crypto pesanti + singoli titoli: concentrazione estrema, massima volatilità.',
    prof:{eta:27,avv:1,cm:'bro'},
    pil:{cash:2000,etf:18000,risk:40000},
    det:{etf:[['Vanguard FTSE All-World','VWCE',18000,13000]],risk:[['Bitcoin','',25000,15000],['Tesla','TSLA',9000,6000],['Nvidia','NVDA',6000,'']]} },
  { id:'basso', nome:'Rischio basso', icon:'lock',
    desc:'Prevalenza di deposito e bond, poco azionario: il profilo prudente classico.',
    prof:{eta:45,avv:8,cm:'std'},
    pil:{cash:8000,deposit:25000,bond:20000,etf:7000} },
  { id:'principiante', nome:'Principiante', icon:'sprout',
    desc:'Pochi capitali e si parte: il piano mostra da dove cominciare senza vendere nulla.',
    prof:{eta:25,avv:4,cm:'std'},
    pil:{cash:2000,etf:6000} },
  { id:'eredita', nome:'Eredità improvvisa', icon:'gift',
    desc:'€150.000 arrivati d\u2019un tratto sul conto: da ridistribuire con calma, senza fretta.',
    prof:{eta:40,avv:5,cm:'std'},
    pil:{cash:150000} },
];

/* ============================================================
   /calculations — utilità
   ============================================================ */
const $  = s=>document.querySelector(s);
const qsa= (s,el)=>Array.from((el||document).querySelectorAll(s));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const sum = arr=>arr.reduce((a,b)=>a+b,0);
const deepClone = o => (typeof structuredClone==='function') ? structuredClone(o) : JSON.parse(JSON.stringify(o));
const esc = s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtE  = v=>'€\u2009'+Math.round(v).toLocaleString('it-IT');
const fmtEs = v=>(v>=0?'+':'−')+'€\u2009'+Math.abs(Math.round(v)).toLocaleString('it-IT');
const fmtP  = p=>(p*100).toLocaleString('it-IT',{maximumFractionDigits:1})+'%';
const fmtPs = pp=>(pp>=0?'+':'−')+Math.abs(pp).toLocaleString('it-IT',{maximumFractionDigits:1})+' pp';
const fmtK  = v=>v>=1e6?('€'+(v/1e6).toLocaleString('it-IT',{maximumFractionDigits:1})+'\u2009M'):(v>=1000?('€'+Math.round(v/1000)+'k'):('€'+Math.round(v)));
const fmtDur = m=>m==null?'—':(m===0?'già raggiunto':(m<12?m+' mesi':(m/12).toFixed(1).replace('.',',')+' anni'));
const pillarTotals = hs=>{ const o={cash:0,deposit:0,bond:0,etf:0,risk:0}; hs.forEach(h=>{ if(o[h.category]!=null) o[h.category]+=h.value; }); return o; };
function parseNum(v){
  if(typeof v==='number') return isFinite(v)?v:0;
  if(!v) return 0;
  let s=String(v).trim().replace(/[€\s]/g,'');
  if(s.includes(',')&&s.includes('.')) s=s.replace(/\./g,'').replace(',','.');
  else if(s.includes(',')) s=s.replace(',','.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(s)) s=s.replace(/\./g,'');
  const n=parseFloat(s); return isFinite(n)?n:0;
}
function niceCeil(v){ if(v<=0)return 1000; const p=Math.pow(10,Math.floor(Math.log10(v))); const f=v/p; const nf=f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10; return nf*p; }

/* ============================================================
   /calculations — emergenza, obiettivi, capitale, liquidità, PAC
   ============================================================ */
function calculateEmergencyFund(input, ctx){
  const ess = Math.max(0, input.spese.essenziali);
  const mRaw = CONFIG.emergenza.mesiBase
    + (10-input.reddito.stabilita)*CONFIG.emergenza.pesoStabilita
    + (input.avversione-5)*CONFIG.emergenza.pesoProfilo;
  const mesi = clamp(Math.round(mRaw*10)/10, CONFIG.emergenza.mesiMin, CONFIG.emergenza.mesiMax);
  const mesiR = Math.round(mesi);
  const totale = ess * mesiR;
  ctx.trace.push({g:'Fondo emergenza', items:[
    {f:'Stabilità reddito '+input.reddito.stabilita+'/10 · profilo '+input.avversione+'/10 → '+String(mesi).replace('.',',')+' mesi di riserva', v:mesiR+' mesi'},
    {f:'Spese essenziali '+fmtE(ess)+' × '+mesiR+' mesi', v:fmtE(totale)},
  ]});
  return { mesi:mesiR, mesiRaw:mesi, totale };
}
function calculateFutureLiabilities(goals, ctx){
  const b={immediato:0,breve:0,medio:0,lungo:0};
  const items = goals.filter(g=>g.importo>0).map(g=>{
    const bucket = g.mesi<6?'immediato': g.mesi<CONFIG.orizzonte.breveMesi?'breve': g.mesi<=CONFIG.orizzonte.medioMesi?'medio':'lungo';
    b[bucket]+=g.importo;
    return Object.assign({},g,{bucket});
  });
  const totale=sum(items.map(i=>i.importo));
  const protetto=b.immediato+b.breve+b.medio;
  const lines=items.map(i=>({f:esc(i.nome)+' · '+fmtE(i.importo)+' · '+i.mesi+' mesi', v:DEST[i.bucket]}));
  if(!lines.length) lines.push({f:'Nessuna spesa futura inserita', v:'—'});
  ctx.trace.push({g:'Spese future e destinazione', items:lines});
  ctx.trace.push({g:'Capitale protetto per obiettivi', items:[
    {f:'Obiettivi ≤ 6 mesi', v:fmtE(b.immediato)},{f:'6–36 mesi', v:fmtE(b.breve)},
    {f:'36–60 mesi', v:fmtE(b.medio)},{f:'Oltre 60 mesi (investibile)', v:fmtE(b.lungo)},
    {f:'Capitale protetto totale', v:fmtE(protetto)},
  ]});
  return {items, buckets:b, totale, protetto};
}
function calculateInvestableCapital(fin, protetto, ctx){
  const coperto = fin>=protetto;
  const investable = Math.max(0, fin-protetto);
  ctx.trace.push({g:'Capitale investibile', items:[
    {f:'Patrimonio finanziario', v:fmtE(fin)},
    {f:'− Capitale protetto (emergenza + obiettivi ≤ 60 mesi)', v:'−'+fmtE(Math.min(fin,protetto))},
    {f:'= Capitale potenzialmente investibile', v:fmtE(investable)},
  ]});
  return {investable, coperto};
}
function calculateLiquidityTest(curCashDep, input, ef, tgt){
  const ess = Math.max(1, input.spese.essenziali);
  const mesi = curCashDep/ess;
  const status = mesi>=ef.mesi?'ok': mesi>=ef.mesi*0.6?'warn':'bad';
  const necessario = tgt.values.cash + tgt.values.deposit;
  const eccesso = Math.max(0, curCashDep - necessario);
  return {liq:curCashDep, mesi, status, necessario, eccesso};
}
function calculatePACSuggestion(input){
  const capacity = input.reddito.mensile + input.reddito.altro - input.spese.essenziali - input.spese.discrezionali;
  const suggerito = capacity>0
    ? Math.floor((capacity*(1-CONFIG.pac.bufferPct))/CONFIG.pac.arrotondaA)*CONFIG.pac.arrotondaA
    : 0;
  return {capacity, suggerito:Math.max(0,suggerito)};
}
function calculatePACPlan(input, gap, reb, tgt){
  const tol=CONFIG.bande.tolleranza*tgt.fin;
  const gaps={}; let gapTot=0;
  PILLARS.forEach(p=>{ const g=Math.max(0, tgt.values[p.k]-tol-reb.cur[p.k]); gaps[p.k]=g; gapTot+=g; });
  const pac=input.pacMensile||0;
  let mesi=null;
  if(gapTot<=1) mesi=0;
  else if(pac>0) mesi=Math.ceil(gapTot/pac);
  const anni = mesi==null?null:mesi/12;
  const venditeEur=sum(reb.vendite.map(v=>v.amount));
  const taxRangeLow=venditeEur*CONFIG.pac.venditaCostoMinPct;
  const taxRangeHigh=venditeEur*CONFIG.pac.venditaCostoMaxPct;
  const immediateCostKnown=!reb.taxUnknown;
  const lowImmediateCost=reb.costoVendite+taxRangeLow;
  const estimatedImmediateCost=(lowImmediateCost+(reb.costoVendite+taxRangeHigh))/2;
  const immediateIsFree=venditeEur<=1 || (reb.costoVendite===0 && reb.vendite.every(v=>v.tax===0));
  const immediateIsLowCost=immediateIsFree || estimatedImmediateCost<=CONFIG.pac.costoSogliaEur;
  const verdict = mesi==null ? 'nessuno' : (mesi===0?'già-nei-range':(
    immediateIsLowCost || anni>CONFIG.pac.sogliaAnni?'B':'A'));
  return {pac, gaps, gapTot, mesi, anni, verdict,
    taxCost:reb.costoVendite, taxUnknown:reb.taxUnknown, immediateCostKnown,
    taxRangeLow:lowImmediateCost, taxRangeHigh:reb.costoVendite+taxRangeHigh,
    venditeN:reb.vendite.length, venditeEur,
    soglia:CONFIG.pac.sogliaAnni, costoSogliaEur:CONFIG.pac.costoSogliaEur, costoMinPct:CONFIG.pac.venditaCostoMinPct,
    costoMaxPct:CONFIG.pac.venditaCostoMaxPct};
}

/* ============================================================
   /risk-engine — Risk Score da profilo unico (nessun questionario)
   ============================================================ */
function calculateRiskScore(input, ctx){
  const declared = (10-input.avversione)/9*100;
  const retDerived = 11-input.avversione;
  const ageScore = input.eta<=45 ? 100 : clamp(100-(input.eta-45)*2.6, 20, 100);
  const stabScore = input.reddito.stabilita/10*100;
  const inc = Math.max(1, input.reddito.mensile+input.reddito.altro);
  const savings = clamp((inc-input.spese.essenziali-input.spese.discrezionali)/inc, 0, .5)/.5*100;
  const capacity = 0.40*ageScore + 0.30*stabScore + 0.30*savings;
  const score = clamp(Math.round(0.60*declared + 0.40*capacity), 1, 100);
  ctx.trace.push({g:'Risk Score (1–100)', items:[
    {f:'Profilo dichiarato (barra unica, peso 60%)', v:declared+'/100'},
    {f:'Derivazioni interne: avversione = '+input.avversione+'/10 · rendimento-vs-stabilità = '+retDerived+'/10', v:'—'},
    {f:'Capacità (peso 40%): età '+input.eta+' (40%) · stabilità reddito (30%) · tasso di risparmio (30%)', v:Math.round(capacity)+'/100'},
    {f:'Risk Score = 60% volontà + 40% capacità', v:score+'/100'},
  ]});
  return {score, declared, capacity};
}

/* ============================================================
   /allocation-engine
   ============================================================ */
function prudenteMature(input){
  return input.eta>=CONFIG.prudenza.etaVecchia && input.avversione>=CONFIG.prudenza.profiloPrudente;
}
function riskCaps(rs, input){
  const mode = input.cryptoMode || 'std';
  if(mode==='no') return {formula:0, avv:0, eta:0, finale:0, binding:'crypto disattivate dall\u2019utente'};
  if(mode==='bro') return {formula:CONFIG.crypto.broCap, avv:CONFIG.crypto.broCap, eta:CONFIG.crypto.broCap,
    finale:CONFIG.crypto.broCap, binding:'modalità crypto bro'};
  if(prudenteMature(input)) return {formula:0, avv:0, eta:0, finale:0,
    binding:'prudenza matura (età ≥ '+CONFIG.prudenza.etaVecchia+' + profilo ≥ '+CONFIG.prudenza.profiloPrudente+')'};
  const formula = CONFIG.crypto.base + Math.pow(rs/100, CONFIG.crypto.curva)*CONFIG.crypto.pendenza;
  const prof = CONFIG.crypto.tabellaProfilo[input.avversione]!=null ? CONFIG.crypto.tabellaProfilo[input.avversione] : 0.12;
  const eta = Math.min(CONFIG.crypto.massimo, CONFIG.crypto.baseEta + Math.max(0,70-input.eta)*CONFIG.crypto.coefsEta);
  const vals = [['formula (risk score)',formula],['limite da profilo',prof],['limite da età',eta],['massimo assoluto',CONFIG.crypto.massimo]];
  vals.sort((a,b)=>a[1]-b[1]);
  return {formula, avv:prof, eta, finale:vals[0][1], binding:vals[0][0]};
}
function calculateTargetAllocation(fin, efTot, fut, risk, input, ctx){
  const caps = riskCaps(risk.score, input);
  const mode = input.cryptoMode || 'std';
  if(!(fin>0)){
    const values={cash:0,deposit:0,bond:0,etf:0,risk:0};
    const pct={}; PILLARS.forEach(p=>pct[p.k]=0);
    ctx.trace.push({g:'Allocazione target', items:[{f:'Patrimonio finanziario nullo', v:'—'}]});
    return {values, pct, fin, investable:0, growthShare:0, caps, protetto:0, avviso:null};
  }
  const speseTot = input.spese.essenziali + input.spese.discrezionali;
  const opCash = clamp(speseTot*CONFIG.cassa.mesiOperativi, CONFIG.cassa.min, CONFIG.cassa.max);
  let p1 = opCash + fut.buckets.immediato;
  let p2 = efTot + fut.buckets.breve;
  let p3 = fut.buckets.medio;
  let protetto = p1+p2+p3, avviso=null;
  if(protetto>fin){
    const f=fin/protetto; p1*=f; p2*=f; p3*=f; protetto=fin;
    avviso='Il patrimonio finanziario non copre interamente il capitale protetto necessario (emergenza + obiettivi a breve): i target di sicurezza sono stati ridotti in proporzione e il rischio viene azzerato finché la riserva non è ricostituita.';
    ctx.warnings.push(avviso);
  }
  const inv = calculateInvestableCapital(fin, protetto, ctx);
  let gs = CONFIG.crescita.base + CONFIG.crescita.ampiezza*Math.pow(risk.score/100, CONFIG.crescita.curva);
  const gsBase = gs;
  const anniMancanti = Math.max(0, CONFIG.giovane.etaLimite - input.eta);
  const youthBoost = anniMancanti>0 ? anniMancanti*CONFIG.giovane.boostPerAnno : 0;
  if(youthBoost>0) gs = Math.min(1, gs + youthBoost);
  const prudAttiva = (mode!=='bro') && prudenteMature(input);
  if(prudAttiva) gs = Math.min(gs, CONFIG.prudenza.maxCrescita);
  if(mode==='bro') gs = Math.min(1, gs + CONFIG.crypto.broBoost);
  const growth = inv.investable*gs;
  const p5 = mode==='no' ? 0 : Math.min(growth, inv.investable*caps.finale);
  const p4 = growth-p5;
  const bondStrat = inv.investable-growth;
  const values = {cash:p1, deposit:p2, bond:p3+bondStrat, etf:p4, risk:p5};
  values.etf += fin - sum(Object.values(values));
  const pct = {}; PILLARS.forEach(p=>pct[p.k]=values[p.k]/fin);
  const modeLine = mode==='no'
    ? {f:'Modalità crypto: NO — pilastro rischiosi azzerato, tutta la crescita va in ETF', v:'risk = 0%'}
    : mode==='bro'
    ? {f:'Modalità crypto: BRO — tetto '+fmtP(CONFIG.crypto.broCap)+' dell\u2019investibile, quota crescita +'+Math.round(CONFIG.crypto.broBoost*100)+'pp (bond strategico ridotto)', v:'risk ≤ '+fmtP(caps.finale)}
    : {f:'Modalità crypto: standard — il modello decide', v:'—'};
  const traceItems=[modeLine,
    {f:'Cassa operativa (1 mese di spese)', v:fmtE(opCash)},
    {f:'Fondo emergenza + obiettivi 6–36 mesi → Deposito', v:fmtE(p2)},
    {f:'Obiettivi 36–60 mesi + bond strategico → Bond', v:fmtE(p3+bondStrat)},
    {f:'Quota crescita base = '+Math.round(CONFIG.crescita.base*100)+'% + '+Math.round(CONFIG.crescita.ampiezza*100)+'%·('+risk.score+'/100)^'+String(CONFIG.crescita.curva).replace('.',',')+' = '+fmtP(gsBase)+' dell\u2019investibile', v:fmtE(inv.investable*gsBase)}];
  if(youthBoost>0) traceItems.push({f:'Boost giovani: +'+Math.round(CONFIG.giovane.boostPerAnno*1000)/10+'pp per anno sotto i '+CONFIG.giovane.etaLimite+' ('+anniMancanti+' anni → +'+fmtP(youthBoost)+'); bond strategico '+(gs>=0.999?'azzerato':'ridotto a '+fmtP(1-gs)+' dell\u2019investibile'), v:'quota crescita '+fmtP(gs)});
  if(mode==='bro') traceItems.push({f:'Boost crypto bro: +'+Math.round(CONFIG.crypto.broBoost*100)+'pp sulla quota crescita', v:fmtP(gs)});
  if(prudAttiva) traceItems.push({f:'Clamp prudenza matura (età ≥ '+CONFIG.prudenza.etaVecchia+' + profilo ≥ '+CONFIG.prudenza.profiloPrudente+'): crescita limitata al '+fmtP(CONFIG.prudenza.maxCrescita)+' dell\u2019investibile (profilo '+Math.round(CONFIG.prudenza.maxCrescita*100)+'-'+Math.round((1-CONFIG.prudenza.maxCrescita)*100)+'), crypto azzerate', v:fmtP(gs)});
  traceItems.push(
    {f:'Limite rischio/crypto'+(mode==='std'&&!prudAttiva?': min(formula '+fmtP(caps.formula)+', profilo '+fmtP(caps.avv)+', età '+fmtP(caps.eta)+', max '+fmtP(CONFIG.crypto.massimo)+') → vincolo attivo: '+caps.binding:(prudAttiva?' → azzerato dal clamp di prudenza matura':(mode==='bro'?' → modalità crypto bro':''))), v:fmtP(caps.finale)},
    {f:'Verifica: Σ pilastri = patrimonio finanziario', v:fmtE(sum(Object.values(values)))});
  ctx.trace.push({g:'Allocazione target', items:traceItems});
  if(mode==='bro') ctx.notices.push('Modalità Crypto bro attiva: il tetto crypto è portato a '+fmtP(CONFIG.crypto.broCap)+' del capitale investibile, i limiti di età e profilo sono stati ignorati e il bond strategico ridotto. È una scelta ad altissima volatilità: controlla lo stress test qui sotto prima di procedere.');
  if(mode==='no') ctx.notices.push('Crypto disattivate: il pilastro rischiosi ha target zero. Le posizioni crypto esistenti sono segnate per l\u2019uscita graduale nel piano di riallocazione, privilegiando le minusvalenze.');
  if(prudAttiva) ctx.notices.push('Profilo prudente maturi (età ≥ '+CONFIG.prudenza.etaVecchia+', profilo ≥ '+CONFIG.prudenza.profiloPrudente+'): applicato il profilo '+Math.round(CONFIG.prudenza.maxCrescita*100)+'-'+Math.round((1-CONFIG.prudenza.maxCrescita)*100)+' difensivo — crypto azzerate e il '+fmtP(1-CONFIG.prudenza.maxCrescita)+' dell\u2019investibile in bond strategici.');
  return {values, pct, fin, investable:inv.investable, growthShare:gs, caps, protetto, avviso};
}

/* ============================================================
   /gap
   ============================================================ */
function calculatePortfolioGap(holdings, tgt){
  const cur = pillarTotals(holdings);
  const rows = PILLARS.map(p=>{
    const c=cur[p.k], t=tgt.values[p.k];
    const cp=tgt.fin>0?c/tgt.fin:0, tp=tgt.pct[p.k];
    const gapEur=c-t, gapPp=(cp-tp)*100;
    const a=Math.abs(gapPp);
    const status = a<=CONFIG.bande.tolleranza*100?'ok': a<=CONFIG.bande.moderata*100?'mild':'strong';
    return {k:p.k, cur:c, curPct:cp, tgt:t, tgtPct:tp, gapEur, gapPp, status, dir:gapPp>0?'sopra':'sotto'};
  });
  return {rows, cur};
}

/* ============================================================
   /rebalancing-engine
   ============================================================ */
function estimateTax(h, amt){
  if(h.cost==null) return {tax:null, known:false};
  const gain=h.value-h.cost;
  if(gain<=0) return {tax:0, known:true, minus:true};
  return {tax:gain*(amt/h.value)*CONFIG.tasse.plusvalenze, known:true, minus:false};
}
function sellRank(h){
  if(h.cost==null) return CONFIG.vendite.penalitaFiscaleSconosciuta;
  const gainRate=(h.value-h.cost)/h.value;
  return gainRate>0 ? gainRate*CONFIG.tasse.plusvalenze : -0.01;
}
function calculateMinimumTransactions(deficits, sources, ticket){
  const saf=k=>(k==='cash'||k==='deposit')?0:1;
  const order=Object.keys(deficits).filter(k=>deficits[k]>ticket*0.5)
    .sort((a,b)=>(saf(a)-saf(b))||(deficits[b]-deficits[a]));
  const moves=[];
  for(const k of order){
    let rem=deficits[k];
    for(const s of sources){
      if(rem<=ticket*0.5) break;
      if(s.amount<=0) continue;
      const amt=Math.min(s.amount, rem);
      moves.push({from:s.src, to:k, amount:amt});
      s.amount-=amt; rem-=amt;
    }
    deficits[k]=Math.max(0,rem);
  }
  return moves;
}
function calculateRebalancing(holdings, tgt, ctx, extraCash, transfersOnly){
  extraCash=extraCash||0; transfersOnly=!!transfersOnly;
  const fin=tgt.fin;
  const tol=CONFIG.bande.tolleranza*fin, ticket=CONFIG.bande.ticketMinimo;
  const cur=pillarTotals(holdings);
  const surplus={}, defs={};
  PILLARS.forEach(p=>{
    surplus[p.k]=Math.max(0, cur[p.k]-tgt.values[p.k]-tol);
    defs[p.k]=Math.max(0, tgt.values[p.k]-tol-cur[p.k]);
  });
  const totalDef=sum(PILLARS.map(p=>defs[p.k]));

  const sources=[];
  ['cash','deposit'].forEach(k=>{
    if(surplus[k]>ticket) sources.push({src:{tipo:'liquido', pillar:k, label:'liquidità in eccesso da '+Pk[k].nome.toLowerCase()}, amount:surplus[k]});
  });
  if(extraCash>0) sources.push({src:{tipo:'esterno', label:'nuovo versamento'}, amount:extraCash});
  const liquidTot=sum(sources.map(s=>s.amount));

  const vendite=[]; const soldByHold=new Map();
  if(!transfersOnly){
    let need=Math.max(0, totalDef-liquidTot);
    for(const k of ['risk','etf','bond']){
      if(need<=ticket*0.5) break;
      let pillarNeed=Math.min(surplus[k], need);
      if(pillarNeed<=ticket) continue;
      const hs=holdings.filter(h=>h.category===k && h.value>0).sort((a,b)=>sellRank(a)-sellRank(b));
      for(const h of hs){
        if(pillarNeed<=ticket*0.5) break;
        const exit = k==='risk' && tgt.values.risk < 0.02*fin;
        const amt = exit ? h.value : Math.min(h.value, pillarNeed);
        if(amt<ticket && !exit) continue;
        const t=estimateTax(h,amt);
        vendite.push({holding:h, pillar:k, amount:amt, tax:t.tax, known:t.known, minus:t.minus, exit,
          fee:Math.max(CONFIG.costi.commissioneMin, amt*CONFIG.costi.commissionePct)});
        soldByHold.set(h, amt);
        pillarNeed-=amt; need-=amt;
      }
    }
    vendite.forEach(v=>sources.push({src:{tipo:'vendita', holding:v.holding, label:'ricavato vendita '+v.holding.name}, amount:v.amount}));
  }

  const moves=calculateMinimumTransactions(defs, sources, ticket);

  let nota=null;
  const proj=Object.assign({},cur);
  vendite.forEach(v=>{ proj[v.pillar]-=v.amount; });
  moves.forEach(m=>{
    if(m.from.tipo==='liquido' && m.from.pillar) proj[m.from.pillar]-=m.amount;
    proj[m.to]+=m.amount;
  });

  sources.forEach(s=>{
    if(s.amount<=ticket) return;
    if(s.src.tipo==='esterno'){
      nota=fmtE(s.amount)+' di nuovo capitale non sono necessari ora: il portafoglio è già oltre target su tutti i pilastri. Mantienili in liquidità o destinali a un obiettivo specifico.';
    } else if(s.src.tipo==='liquido'){
      nota=fmtE(s.amount)+' restano in '+s.src.label+': il portafoglio è già oltre target su tutti i pilastri. Valuta obiettivi patrimoniali aggiuntivi prima di investire ulteriore capitale.';
    } else {
      let best=null,bg=-Infinity;
      PILLARS.forEach(p=>{ const g=tgt.values[p.k]-proj[p.k]; if(g>bg){bg=g;best=p.k;} });
      moves.push({from:s.src, to:best, amount:s.amount});
      proj[best]+=s.amount; s.amount=0;
    }
  });

  const keeps=[], reviews=[];
  holdings.forEach(h=>{
    const sold=soldByHold.get(h)||0;
    if(sold>=h.value-1) return;
    if(sold>0){
      const t=estimateTax(h,sold);
      reviews.push({h, motivo:'Riduzione parziale ('+fmtE(sold)+'): '+(t.known?'ritenuta stimata inclusa nel piano.':'costo di acquisto non indicato → impatto fiscale da verificare.')});
      return;
    }
    let m='Coerente col target: nessuna operazione necessaria.';
    if(h.cost==null && h.value>fin*0.05) m='Coerente col target. Nota: costo di acquisto non indicato → impatto fiscale non stimabile in caso di future vendite.';
    keeps.push({h, motivo:m});
  });
  holdings.forEach(h=>{
    const sold=soldByHold.get(h)||0;
    if(sold===0 && h.cost!=null){
      const g=h.value-h.cost;
      if(g>fin*0.08) reviews.push({h, motivo:'Plusvalenza latente '+fmtE(g)+': vendere ora genererebbe una plusvalenza tassabile (~'+fmtE(g*CONFIG.tasse.plusvalenze)+' al 26%). Potrebbe essere preferibile riequilibrare tramite nuovi versamenti.'});
    }
    if(h.category==='risk' && !isCryptoName(h.name) && h.value>fin*0.12)
      reviews.push({h, motivo:'Singolo titolo azionario con peso rilevante: concentration risk da monitorare.'});
  });
  const taxUnknown=vendite.some(v=>!v.known);
  const costoVendite=vendite.reduce((a,v)=>a+v.fee+(v.tax||0),0);
  const capitaleRiallocato=sum(moves.map(m=>m.amount));
  ctx.trace.push({g:'Riequilibrio (minimum-change)', items:[
    {f:'Banda di tolleranza per pilastro (±3% del patrimonio)', v:'±'+fmtE(tol)},
    {f:'Ticket minimo per operazione', v:fmtE(ticket)},
    {f:'Liquidità ridistribibile senza vendite', v:fmtE(liquidTot)},
    {f:'Capitale da vendere (solo se realmente necessario)', v:fmtE(sum(vendite.map(v=>v.amount)))},
    {f:'Capitale riallocato in totale', v:fmtE(capitaleRiallocato)},
    {f:'Operazioni consigliate (vendite + spostamenti)', v:String(vendite.length+moves.length)},
  ]});
  return {cur, tol, vendite, moves, keeps, reviews, proj, nota,
    opsCount:vendite.length+moves.length, capitaleRiallocato, costoVendite, taxUnknown, ticket};
}
function calculatePAC(mensile, proj, tgt, ctx, label){
  if(!(mensile>0)) return null;
  label=label||'PAC target-aware';
  const tolP=CONFIG.bande.tolleranza*tgt.fin*0.5;
  const gap={}; PILLARS.forEach(p=>gap[p.k]=Math.max(0, tgt.values[p.k]-proj[p.k]-tolP));
  const split=[]; let resto=mensile;
  const safQ=PILLARS.filter(p=>(p.k==='cash'||p.k==='deposit')&&gap[p.k]>0).sort((a,b)=>gap[b.k]-gap[a.k]);
  for(const p of safQ){ const a=Math.min(resto,gap[p.k]); if(a>=CONFIG.bande.ticketMinPac){split.push({k:p.k, amount:a, motivo:'priorità alla sicurezza'}); resto-=a;} if(resto<=0)break; }
  if(resto>0){
    const growth=PILLARS.filter(p=>!['cash','deposit'].includes(p.k)&&gap[p.k]>=CONFIG.bande.ticketMinPac);
    const totGap=sum(growth.map(p=>gap[p.k]));
    if(totGap>0){
      growth.forEach(p=>{ const a=Math.round(resto*gap[p.k]/totGap); if(a>0) split.push({k:p.k, amount:a, motivo:'colma il gap residuo'}); });
    } else {
      const base={bond:tgt.values.bond, etf:tgt.values.etf, risk:tgt.values.risk};
      const bt=sum(Object.values(base));
      if(bt>0) ['etf','bond','risk'].forEach(k=>{ const a=Math.round(resto*base[k]/bt); if(a>0) split.push({k, amount:a, motivo:'manutenzione (portafoglio nei range)'}); });
    }
  }
  if(!split.length && mensile>0){
    split.push({k:'etf', amount:mensile, motivo:'manutenzione (nessun gap aperto)'});
  } else if(split.length){
    const tot0=sum(split.map(s=>s.amount));
    const diff=mensile-tot0;
    if(diff!==0) split[0].amount+=diff;
  }
  const tot=sum(split.map(s=>s.amount));
  const modalita=split.some(s=>s.motivo.indexOf('manutenzione')===0)?'manutenzione':'correzione';
  ctx.trace.push({g:label, items:[
    {f:'Versamento mensile (90% della capacità di risparmio)', v:fmtE(mensile)},
    {f:'Modalità: '+modalita+' — i pilastri sopra target ricevono €0', v:fmtE(tot)+' allocati'},
  ]});
  return {split, mensile, totale:tot, modalita};
}
function distributeCash(amount, holdings, tgt){
  const ctx={trace:[],warnings:[],notices:[]};
  return calculateRebalancing(holdings, tgt, ctx, amount, true);
}

/* ============================================================
   /projection
   ============================================================ */
function mixStats(w){
  let r=0,v=0,dd=0;
  PILLARS.forEach(p=>{ const x=w[p.k]||0;
    r+=x*(CONFIG.rendimenti[p.k]||0);
    v+=x*(CONFIG.volatilita[p.k]||0);
    dd+=x*(CONFIG.drawdown[p.k]||0);
  });
  return {r, vol:v, dd};
}
function projectSeries(fin, pac, r, anni){
  const rm=Math.pow(1+r,1/12)-1;
  const out=[fin]; let v=fin;
  for(let m=1;m<=anni*12;m++){ v=v*(1+rm)+pac; out.push(v); }
  return out;
}
function calculateProiezione(input, curTot, tgt){
  const cfg=CONFIG.proiezione, fin=tgt.fin;
  const wAtt={}, wTgt=tgt.pct;
  PILLARS.forEach(p=>wAtt[p.k]=fin>0?(curTot[p.k]||0)/fin:0);
  const a=mixStats(wAtt), t=mixStats(wTgt);
  const pac=Math.max(0,input.pacMensile||0);
  const yearly=s=>{ const arr=[]; for(let y=0;y<=cfg.anni;y++)arr.push(s[y*12]); return arr; };
  const yAtt=yearly(projectSeries(fin,pac,a.r,cfg.anni));
  const yTgt=yearly(projectSeries(fin,pac,t.r,cfg.anni));
  const real=(v,y)=>v/Math.pow(1+cfg.inflazione,y);
  const recovery=(dd,r)=>(dd<=0.001||r<=0.002)?null:Math.log(1/(1-dd))/Math.log(1+r);
  const milestones=cfg.milestones.map(y=>({y, att:yAtt[y], tgt:yTgt[y], diff:yTgt[y]-yAtt[y], tgtReale:real(yTgt[y],y), attReale:real(yAtt[y],y)}));
  return {a, t, pac, yAtt, yTgt, milestones,
    lossAtt:fin*a.dd, lossTgt:fin*t.dd,
    recAtt:recovery(a.dd,a.r), recTgt:recovery(t.dd,t.r)};
}

/* ============================================================
   /stress-test · risk score · concentrazione
   ============================================================ */
function calculateStressTest(values, essential){
  const totale=sum(PILLARS.map(p=>values[p.k]||0));
  return CONFIG.stress.map(s=>{
    let loss=0;
    PILLARS.forEach(p=>{ loss += (values[p.k]||0) * (-(s.shocks[p.k]||0)); });
    return Object.assign({},s,{loss, lossPct:totale>0?loss/totale:0, remaining:totale-loss,
      mesiLiq:(values.cash+values.deposit)/Math.max(1,essential)});
  });
}
function portfolioRiskScore(pct, maxAssetPct){
  const v=CONFIG.volatilita;
  const base=(pct.cash*v.cash+pct.deposit*v.deposit+pct.bond*v.bond+pct.etf*v.etf+pct.risk*v.risk)*CONFIG.rischioPort.scala;
  const pen=Math.min(CONFIG.rischioPort.penalitaConcMax, Math.max(0,(maxAssetPct-0.2)*40));
  return clamp(Math.round(base+pen),1,100);
}
function calculateConcentration(holdings, fin, tgt){
  const out={statements:[]};
  const sorted=holdings.slice().sort((a,b)=>b.value-a.value);
  out.maxAsset=sorted.length?Object.assign({},sorted[0],{pct:fin>0?sorted[0].value/fin:0}):{pct:0,name:'—'};
  const crypto=sum(holdings.filter(h=>isCryptoName(h.name)).map(h=>h.value));
  const stocks=sum(holdings.filter(h=>h.category==='risk'&&!isCryptoName(h.name)).map(h=>h.value));
  out.cryptoPct=fin>0?crypto/fin:0; out.stocksPct=fin>0?stocks/fin:0;
  out.capCrypto=tgt.caps.finale;
  const cur=pillarTotals(holdings);
  const maxCat=PILLARS.map(p=>({k:p.k,pct:fin>0?cur[p.k]/fin:0})).sort((a,b)=>b.pct-a.pct)[0];
  out.maxCat=maxCat;
  const geo={}; let known=0;
  holdings.forEach(h=>{ const t=TICKER_DB[String(h.ticker||'').toUpperCase()]; if(t){ geo[t.area]=(geo[t.area]||0)+h.value; known+=h.value; } });
  out.geo={geo, coverage:fin>0?known/fin:0};
  if(out.maxAsset.pct>0.25) out.statements.push({s:'bad', t:'Il '+fmtP(out.maxAsset.pct)+' del patrimonio finanziario è concentrato in un singolo asset ('+esc(out.maxAsset.name)+').'});
  else if(out.maxAsset.pct>0.18) out.statements.push({s:'warn', t:'Il '+fmtP(out.maxAsset.pct)+' del patrimonio è in un singolo asset ('+esc(out.maxAsset.name)+'): peso elevato da monitorare.'});
  if(tgt.caps.finale>0 && out.cryptoPct>out.capCrypto*1.3) out.statements.push({s:'bad', t:'L\u2019esposizione crypto/rischiosa è '+fmtP(out.cryptoPct)+', contro un limite indicato di '+fmtP(out.capCrypto)+' per il tuo profilo.'});
  if(tgt.caps.finale===0 && out.cryptoPct>0) out.statements.push({s:'warn', t:'Detieni crypto per '+fmtP(out.cryptoPct)+' del patrimonio ma il target è zero: il piano ne propone l\u2019uscita graduale.'});
  if(out.stocksPct>0.12) out.statements.push({s:'warn', t:'I singoli titoli azionari pesano '+fmtP(out.stocksPct)+': nessuna diversificazione interna.'});
  if(maxCat.pct>0.5) out.statements.push({s:'warn', t:'Il pilastro «'+Pk[maxCat.k].nome+'» concentra il '+fmtP(maxCat.pct)+' del patrimonio finanziario.'});
  if(out.geo.coverage>0.4){
    const parts=Object.keys(out.geo.geo).map(a=>a+' '+fmtP(out.geo.geo[a]/fin));
    out.statements.push({s:'warn', t:'Esposizione geografica rilevata dai ticker: '+parts.join(' · ')+' (copertura analisi '+fmtP(out.geo.coverage)+').'});
  } else out.statements.push({s:'ok', t:'Ticker insufficienti per un\u2019analisi geografica affidabile: dato dichiarato, non stimato.'});
  if(!out.statements.some(s=>s.s!=='ok')) out.statements.unshift({s:'ok', t:'Nessuna concentrazione rilevante: nessun asset supera il 18% del patrimonio finanziario.'});
  return out;
}

/* ============================================================
   Invarianti automatiche del motore
   ============================================================ */
function runInvariantChecks(R){
  const t=[]; const add=(nome,ok,detail)=>t.push({nome,ok,detail});
  const sumPct=sum(PILLARS.map(p=>R.tgt.pct[p.k]));
  add('Σ allocazioni target = 100%', Math.abs(sumPct-1)<0.0005, fmtP(sumPct));
  const sumVal=sum(PILLARS.map(p=>R.tgt.values[p.k]));
  add('Σ valori target = patrimonio finanziario', Math.abs(sumVal-R.tgt.fin)<1, fmtE(sumVal));
  add('Nessun pilastro target negativo', PILLARS.every(p=>R.tgt.values[p.k]>=-0.01), 'verificato');
  add('Fondo emergenza ≤ pilastri di sicurezza', R.ef.totale<=R.tgt.values.cash+R.tgt.values.deposit+0.5, fmtE(R.ef.totale)+' ≤ '+fmtE(R.tgt.values.cash+R.tgt.values.deposit));
  add('Obiettivi protetti ≤ capitale di sicurezza (se coperto)', !R.fut.protetto||R.inv.coperto ? R.fut.protetto<=R.tgt.values.cash+R.tgt.values.deposit+R.tgt.values.bond+0.5 : true, R.inv.coperto?'coperto':'sotto-copertura dichiarata');
  add('Target rischio ≤ limite profilo', R.tgt.values.risk<=R.tgt.fin*R.tgt.caps.finale+1, fmtP(R.tgt.pct.risk)+' ≤ '+fmtP(R.tgt.caps.finale));
  if((R.input.cryptoMode||'std')==='no') add('Modalità «No crypto»: pilastro rischiosi azzerato', R.tgt.values.risk<=0.01, fmtP(R.tgt.pct.risk));
  if(prudenteMature(R.input) && (R.input.cryptoMode||'std')!=='bro') add('Prudenza matura: crypto = 0 e crescita ≤ '+fmtP(CONFIG.prudenza.maxCrescita)+' dell\u2019investibile', R.tgt.values.risk<=0.01 && R.tgt.growthShare<=CONFIG.prudenza.maxCrescita+0.001, 'crypto '+fmtP(R.tgt.pct.risk)+' · crescita '+fmtP(R.tgt.growthShare));
  if(R.risk && R.input.eta<CONFIG.giovane.etaLimite && (R.input.cryptoMode||'std')!=='bro') add('Boost giovani applicato alla quota crescita', R.tgt.growthShare>=Math.min(1,(CONFIG.crescita.base+CONFIG.crescita.ampiezza*Math.pow(R.risk.score/100,CONFIG.crescita.curva))+(CONFIG.giovane.etaLimite-R.input.eta)*CONFIG.giovane.boostPerAnno-0.001), 'quota crescita '+fmtP(R.tgt.growthShare));
  add('PAC = 90% della capacità di risparmio', Math.abs((R.input.pacMensile||0)-R.pacSug.suggerito)<=0.01, fmtE(R.input.pacMensile||0)+' = '+fmtE(R.pacSug.suggerito));
  if(R.pac) add('PAC allocato = versamento mensile', Math.abs(R.pac.totale-R.pac.mensile)<=1, fmtE(R.pac.totale)+' = '+fmtE(R.pac.mensile));
  if(R.pacPlan && R.pacPlan.mesi!=null && R.pacPlan.mesi>0) add('Tempo PAC = ⌈divario ÷ PAC⌉ mesi', R.pacPlan.mesi===Math.ceil(R.pacPlan.gapTot/R.pacPlan.pac), R.pacPlan.mesi+' mesi');
  add('Σ portafoglio attuale = patrimonio finanziario', Math.abs(sum(PILLARS.map(p=>R.gap.cur[p.k]))-R.tgt.fin)<1, fmtE(sum(PILLARS.map(p=>R.gap.cur[p.k]))));
  const projSum=sum(PILLARS.map(p=>R.reb.proj[p.k]));
  add('Σ proiezione post-piano = patrimonio (nessun euro creato o perso)', Math.abs(projSum-R.tgt.fin)<1, fmtE(projSum));
  add('Proiezione senza pilastri negativi', PILLARS.every(p=>R.reb.proj[p.k]>=-0.01), 'verificato');
  if(R.proj){
    const P=R.proj;
    add('Proiezione: series coerenti (anno 0 = patrimonio)', Math.abs(P.yAtt[0]-R.tgt.fin)<1 && Math.abs(P.yTgt[0]-R.tgt.fin)<1, 'anno 0 = '+fmtE(P.yTgt[0]));
    add('Proiezione: PAC composto mensilmente, '+CONFIG.proiezione.anni+' anni', P.yAtt.length===CONFIG.proiezione.anni+1 && P.yTgt.length===CONFIG.proiezione.anni+1, P.yTgt.length+' punti');
  }
  return t;
}

/* ============================================================
   Orchestratori (funzioni pure)
   ============================================================ */
function computeReale(reale){
  let imm=0, deb=0;
  if(reale.casa.on){ imm+=reale.casa.valore; deb+=reale.casa.mutuo; }
  if(reale.auto.on){ imm+=reale.auto.valore; deb+=reale.auto.fin; }
  (reale.extra||[]).forEach(x=>{ if(x.tipo==='debito') deb+=x.valore; else imm+=x.valore; });
  return {imm, deb};
}
function runCore(input){
  const ctx={trace:[],warnings:[],notices:[]};
  const fin=sum(input.holdings.map(h=>h.value));
  const ef=calculateEmergencyFund(input,ctx);
  const fut=calculateFutureLiabilities(input.obiettivi,ctx);
  const risk=calculateRiskScore(input,ctx);
  const tgt=calculateTargetAllocation(fin, ef.totale, fut, risk, input, ctx);
  return {ctx, fin, ef, fut, risk, tgt};
}
function analyze(input){
  const pacSug=calculatePACSuggestion(input);
  input.pacMensile=pacSug.suggerito;
  const core=runCore(input);
  const ctx=core.ctx, fin=core.fin, ef=core.ef, fut=core.fut, risk=core.risk, tgt=core.tgt;
  const re=computeReale(input.reale);
  const gap=calculatePortfolioGap(input.holdings, tgt);
  const rctx={trace:[],warnings:[],notices:[]};
  const reb=calculateRebalancing(input.holdings, tgt, rctx, 0, false);
  const pac=calculatePAC(input.pacMensile, reb.proj, tgt, rctx);
  const pacPlan=calculatePACPlan(input, gap, reb, tgt);
  rctx.trace.push({g:'Piano PAC vs redistribuzione immediata', items:[
    {f:'Divario da colmare (Σ deficit oltre la tolleranza ±3%)', v:fmtE(pacPlan.gapTot)},
    {f:'PAC mensile possibile (90% della capacità)', v:fmtE(pacPlan.pac)},
    {f:'Tempo stimato con solo PAC (⌈divario ÷ PAC⌉)', v:fmtDur(pacPlan.mesi)+(pacPlan.mesi>0?' ('+pacPlan.mesi+' mesi)':'')},
    {f:'Costo stimato della redistribuzione immediata', v:fmtE(pacPlan.taxRangeLow)+'–'+fmtE(pacPlan.taxRangeHigh)},
    {f:'Regola decisionale', v:'costo ≤ '+fmtE(pacPlan.costoSogliaEur)+' o PAC oltre '+pacPlan.soglia+' anni → Piano B'},
  ]});
  const ess=Math.max(1,input.spese.essenziali);
  const stressCur=calculateStressTest(gap.cur, ess);
  const stressTgt=calculateStressTest(tgt.values, ess);
  const conc=calculateConcentration(input.holdings, fin, tgt);
  const proj=calculateProiezione(input, gap.cur, tgt);
  const pctOf={}; PILLARS.forEach(p=>pctOf[p.k]=fin>0?gap.cur[p.k]/fin:0);
  const rCur=portfolioRiskScore(pctOf, conc.maxAsset.pct);
  const rTgt=portfolioRiskScore(tgt.pct, 0);
  const liq=calculateLiquidityTest(gap.cur.cash+gap.cur.deposit, input, ef, tgt);
  const invariants=runInvariantChecks({input, ef, fut, risk, tgt, gap, reb, pac, pacPlan, pacSug, proj, inv:{coperto:fin>=fut.protetto}});
  let bps=[];
  try{ bps=calculateBreakpoints(input); }
  catch(e){ console.warn('Breakpoint analysis non disponibile:', e); }
  return {input, fin, imm:re.imm, deb:re.deb, netWorth:fin+re.imm-re.deb, ef, fut, risk, tgt, gap, reb, pac, pacSug, pacPlan,
    stressCur, stressTgt, conc, proj, rCur, rTgt, liq, invariants, bps,
    trace:ctx.trace.concat(rctx.trace), warnings:ctx.warnings.concat(rctx.warnings),
    notices:ctx.notices.concat(rctx.notices)};
}
function calculateBreakpoints(input){
  const base=runCore(input);
  const out=[];
  const clone=patch=>{ const c=deepClone(input); patch(c); return runCore(c); };
  const ess2=Math.round(input.spese.essenziali*1.3);
  const a=clone(c=>{c.spese.essenziali=ess2;});
  out.push('Se le spese essenziali salissero da '+fmtE(input.spese.essenziali)+' a '+fmtE(ess2)+', il fondo emergenza passerebbe da '+fmtE(base.ef.totale)+' a '+fmtE(a.ef.totale)+' ('+a.ef.mesi+' mesi), il capitale investibile scenderebbe di '+fmtE(base.tgt.investable-a.tgt.investable)+' e il PAC mensile scenderebbe a '+fmtE(calculatePACSuggestion(a.input).suggerito)+'.');
  const b=clone(c=>{c.reddito.stabilita=4;});
  out.push('Se la stabilità del reddito scendesse a 4/10, i mesi di riserva consigliati passerebbero da '+base.ef.mesi+' a '+b.ef.mesi+' (fondo: '+fmtE(b.ef.totale)+').');
  const profUi=11-input.avversione;
  const profUi2=clamp(profUi+3,1,10);
  const c=clone(cc=>{cc.avversione=11-profUi2;});
  out.push('Se il tuo profilo di rischio passasse da '+profUi+'/10 a '+profUi2+'/10 (verso il rendimento), il target Risk salirebbe da '+fmtP(base.tgt.pct.risk)+' a '+fmtP(c.tgt.pct.risk)+' e il target ETF da '+fmtP(base.tgt.pct.etf)+' a '+fmtP(c.tgt.pct.etf)+'.');
  const c2=deepClone(input); c2.holdings=c2.holdings.map(h=>Object.assign({},h,{value:h.value*2}));
  const d=runCore(c2);
  out.push('Con '+fmtE(d.fin)+' di patrimonio finanziario invece di '+fmtE(base.fin)+', il target ETF passerebbe da '+fmtE(base.tgt.values.etf)+' ('+fmtP(base.tgt.pct.etf)+') a '+fmtE(d.tgt.values.etf)+' ('+fmtP(d.tgt.pct.etf)+'): la quota protetta scende dal '+fmtP(base.fin>0?base.tgt.protetto/base.fin:0)+' al '+fmtP(d.fin>0?d.tgt.protetto/d.fin:0)+'.');
  if(input.eta>=CONFIG.giovane.etaLimite){
    const yg=clone(cc=>{cc.eta=18;});
    out.push('A 18 anni il boost giovanile porterebbe la quota crescita dell\u2019investibile a '+fmtP(yg.tgt.growthShare)+' (bond strategico ~0: solo ETF e crypto).');
  } else {
    const old=clone(cc=>{cc.eta=CONFIG.giovane.etaLimite+10;});
    out.push('Superati i '+CONFIG.giovane.etaLimite+' anni il boost giovanile scade: a '+old.input.eta+' anni la quota crescita dell\u2019investibile scenderebbe a '+fmtP(old.tgt.growthShare)+' e il bond strategico salirebbe a '+fmtP(1-old.tgt.growthShare)+'.');
  }
  if(!prudenteMature(input) && (input.cryptoMode||'std')!=='bro'){
    const vp=clone(cc=>{cc.eta=CONFIG.prudenza.etaVecchia; cc.avversione=Math.max(cc.avversione, CONFIG.prudenza.profiloPrudente);});
    out.push('A '+CONFIG.prudenza.etaVecchia+' anni con profilo ≥ '+CONFIG.prudenza.profiloPrudente+' il modello applicherebbe il profilo difensivo: crescita max '+fmtP(CONFIG.prudenza.maxCrescita)+' dell\u2019investibile e crypto 0 (ora: crescita '+fmtP(base.tgt.growthShare)+', crypto '+fmtP(base.tgt.pct.risk)+').');
  }
  const mode=(input.cryptoMode||'std');
  if(mode!=='bro'){
    const bro=clone(cc=>{cc.cryptoMode='bro';});
    out.push('Portando l\u2019esposizione crypto su «Crypto bro», il target Risk salirebbe da '+fmtP(base.tgt.pct.risk)+' a '+fmtP(bro.tgt.pct.risk)+' e il target Bond scenderebbe da '+fmtP(base.tgt.pct.bond)+' a '+fmtP(bro.tgt.pct.bond)+'.');
  }
  if(mode!=='no'){
    const noc=clone(cc=>{cc.cryptoMode='no';});
    out.push('Portando l\u2019esposizione crypto su «No crypto», il target Risk scenderebbe a 0 e l\u2019intera quota crescita andrebbe in ETF (target ETF da '+fmtP(base.tgt.pct.etf)+' a '+fmtP(noc.tgt.pct.etf)+').');
  }
  return out;
}

/* ============================================================
   Input d'esempio puro (usato da UI e test automatici)
   ============================================================ */
function buildTestInput(){
  return {
    eta:32, avversione:5, cryptoMode:'std',
    reddito:{mensile:2600, altro:0, stabilita:7},
    spese:{essenziali:1000, discrezionali:400},
    obiettivi:[
      {nome:'Vacanza', importo:3000, mesi:6},
      {nome:'Auto', importo:8000, mesi:12},
      {nome:'Casa (acconto)', importo:20000, mesi:84},
    ],
    reale:{
      casa:{on:true, valore:190000, mutuo:118000},
      auto:{on:true, valore:14000, fin:6000},
      extra:[{tipo:'bene', nome:'Oggetti di valore', valore:2500}],
    },
    holdings:[
      {name:'Conto corrente', category:'cash', ticker:'', value:4000, cost:null},
      {name:'Conto deposito', category:'deposit', ticker:'', value:8000, cost:null},
      {name:'BTP Italia 2031', category:'bond', ticker:'BTP', value:6000, cost:null},
      {name:'Vanguard FTSE All-World', category:'etf', ticker:'VWCE', value:20000, cost:15500},
      {name:'Bitcoin', category:'risk', ticker:'', value:12000, cost:9000},
      {name:'Tesla', category:'risk', ticker:'TSLA', value:3000, cost:null},
    ],
  };
}
function variantInput(base, patch){ const c=deepClone(base); patch(c); return c; }

/* ============================================================
   UI — wizard, righe dinamiche, stato
   ============================================================ */
const S={input:null, R:null};
let activePreset=null;
const refreshIcons=()=>{ if(window.lucide) lucide.createIcons(); };
const AVV_L=v=>v+' · '+(v<=2?'molto prudente':v<=4?'prudente':v<=6?'bilanciato':v<=8?'aggressivo':'molto aggressivo');
const CM_L=v=>['No crypto — pilastro azzerato','Standard — il modello decide','Crypto bro — enfatizzata'][+v]||'—';
const CM_MAP={no:0, std:1, bro:2};
const STAB_L=v=>v+'/10 · '+(v<=2?'molto variabile':v<=4?'variabile':v<=6?'moderatamente stabile':v<=8?'stabile':'molto stabile');
const AGE_STAGES=[
  {max:39,icon:'sprout',name:'Fase di crescita',detail:'Tempo e flessibilità per costruire',color:'var(--c4)'},
  {max:59,icon:'scale',name:'Fase di equilibrio',detail:'Crescita e protezione si bilanciano',color:'var(--c3)'},
  {max:90,icon:'shield-check',name:'Fase di protezione',detail:'La stabilità diventa sempre più importante',color:'var(--c2)'},
];

const PIPE_STAGES=['Situazione personale','Patrimonio','Spese','Emergency fund','Obiettivi futuri','Capacità di risparmio','Risk score','Portafoglio target','Confronto & gap','Minimum-change rebalancing','Proiezione rendimenti','Piano operativo'];
 $('#pipe-list').innerHTML=PIPE_STAGES.map((t,i)=>'<li style="animation-delay:'+(i*90)+'ms"><span class="n">'+String(i+1).padStart(2,'0')+'</span><span class="t">'+t+'</span></li>').join('');

const STEPS=['Profilo & rischio','Reddito','Spese','Obiettivi','Patrimonio & pilastri','Analisi'];
let step=1;
function renderRail(){
  $('#rail').innerHTML=STEPS.map((s,i)=>{
    const n=i+1;
    return '<button type="button" data-go="'+n+'" class="'+(n===step?'cur':n<step?'done':'')+'"><span class="rn">'+String(n).padStart(2,'0')+'</span><span>'+s+'</span></button>';
  }).join('');
  qsa('#rail button').forEach(b=>b.addEventListener('click',()=>goStep(+b.dataset.go)));
}
function goStep(n){
  step=clamp(n,1,6);
  qsa('.wpanel').forEach(p=>{ p.hidden = +p.dataset.step!==step; });
  $('#btn-prev').hidden = step===1;
  $('#btn-next').hidden = step===6;
  $('#btn-analyze').hidden = step!==6;
  if(step===6) updateSummary();
  renderRail();
}
/* --- barra profilo: 5 segmenti grandi e vuoti (niente icone dentro) + range sovrapposto --- */
function renderBPZones(){
  const zones=BP_ZONES.map(()=>'<div class="bp-zone"></div>').join('');
  $('#bp-zones').innerHTML=zones
    +'<input type="range" id="f-avv" min="1" max="10" step="1" value="5" aria-label="Profilo di rischio: da stabilità a rendimento">';
  /* simbolo attuale: SOTTO la barra, tutte e 5 le icone pre-renderizzate sovrapposte */
  $('#bp-current').innerHTML='<span class="bpc-ico">'
    +BP_ZONES.map(z=>'<i data-lucide="'+z.icon+'"></i>').join('')
    +'</span><div class="bpc-txt"><div class="bpc-name" id="bpc-name">—</div><div class="bpc-sub" id="bpc-sub"></div></div>';
}
function updateProfileLive(){
  const v=clamp(+$('#f-avv').value,1,10);
  const zi=Math.ceil(v/2)-1;
  const zone=BP_ZONES[zi];
  /* TUTTE le zone attive si riempiono con il colore UNICO della zona corrente:
     coerente, non una progressione */
  qsa('#bp-zones .bp-zone').forEach((el,i)=>{
    const on=i<=zi;
    el.classList.toggle('on', on);
    el.style.background = on ? zone.col : '';
    el.style.borderColor = on ? zone.col : '';
  });
  const num=$('#bp-num');
  num.textContent=v;
  num.style.color=zone.col;
  num.classList.remove('bump');
  void num.offsetWidth;
  num.classList.add('bump');
  /* simbolo attuale sotto la barra: icona grande (fade+zoom), nome e descrizione */
  const cur=$('#bp-current');
  if(cur){
    cur.style.color=zone.col;
    qsa('.bpc-ico i, .bpc-ico svg',cur).forEach((ic,i)=>ic.classList.toggle('on', i===zi));
    const nameEl=$('#bpc-name'); if(nameEl) nameEl.textContent=zone.name;
    const subEl=$('#bpc-sub');
    if(subEl) subEl.textContent=zone.desc+' (posizione '+v+' di 10 · zona '+(zi+1)+' di 5)';
  }
}
/* --- selettore crypto a 3 pulsanti --- */
function updateCryptoLive(){
  const v=+$('#f-crypto').value;
  $('#o-cm').textContent=CM_L(v);
  qsa('#cm-sel .cmopt').forEach(b=>b.classList.toggle('on', +b.dataset.cm===v));
}
function updateAgeLive(){
  const input=$('#f-eta');
  if(!input) return;
  const field=input.closest('.age-field');
  const rawValue=Number(input.value);
  const value=clamp(Number.isFinite(rawValue)?rawValue:32,18,90);
  const stage=AGE_STAGES.find(s=>value<=s.max)||AGE_STAGES[AGE_STAGES.length-1];
  const index=AGE_STAGES.indexOf(stage);
  const pct=((value-18)/(90-18))*100;
  input.value=value;
  input.style.setProperty('--age-progress',pct+'%');
  const output=$('#o-eta'); if(output) output.textContent=value+' anni';
  const name=$('#age-stage'); if(name) name.textContent=stage.name;
  const detail=$('#age-stage-detail'); if(detail) detail.textContent=stage.detail;
  if(field){
    field.dataset.ageStage=String(index);
    field.style.setProperty('--age-color',stage.color);
    qsa('.age-icon i, .age-icon svg',field).forEach((icon,i)=>{
      icon.classList.toggle('on',i===index);
    });
  }
}
/* --- preset scenari --- */
function renderPresets(){
  const grid=$('#preset-grid'); if(!grid) return;
  grid.innerHTML=PRESETS.map(p=>'<button type="button" class="preset'+(activePreset===p.id?' on':'')+'" data-preset="'+p.id+'"><span class="pn"><i data-lucide="'+p.icon+'"></i>'+esc(p.nome)+'</span><span class="pd">'+esc(p.desc)+'</span></button>').join('');
  qsa('#preset-grid .preset').forEach(b=>b.addEventListener('click',()=>{
    const p=PRESETS.find(x=>x.id===b.dataset.preset);
    if(p) applyPreset(p);
  }));
  refreshIcons();
}
function applyPreset(p){
  activePreset=p.id;
  renderPillars();
  PILLARS.forEach(pd=>{ const el=pillarCardEl(pd.k).querySelector('.p-amt'); el.value=p.pil[pd.k]||0; });
  Object.keys(p.det||{}).forEach(k=>{ (p.det[k]||[]).forEach(d=>addDetail(k,{name:d[0],ticker:d[1],value:d[2],cost:d[3]})); });
  renderPresets(); updateLive();
}
/* --- righe dinamiche --- */
function rowGoal(g){
  g=g||{nome:'',importo:'',mesi:''};
  const d=document.createElement('div');
  d.className='row goal-row';
  d.innerHTML='<input type="text" class="g-name" placeholder="es. Auto" value="'+esc(g.nome)+'">'
    +'<input type="number" class="g-amt" placeholder="8000" min="0" value="'+g.importo+'">'
    +'<input type="number" class="g-months" placeholder="12" min="1" value="'+g.mesi+'">'
    +'<button type="button" class="rdel" title="Rimuovi"><i data-lucide="trash-2"></i></button>';
  return d;
}
function rowExtra(x){
  x=x||{tipo:'bene',nome:'',valore:''};
  const d=document.createElement('div');
  d.className='row'; d.style.gridTemplateColumns='.6fr 1.6fr 1fr 40px';
  d.innerHTML='<select class="x-tipo"><option value="bene"'+(x.tipo==='bene'?' selected':'')+'>Bene</option><option value="debito"'+(x.tipo==='debito'?' selected':'')+'>Debito</option></select>'
    +'<input type="text" class="x-nome" placeholder="es. terreno, prestito personale" value="'+esc(x.nome)+'">'
    +'<input type="number" class="x-val" placeholder="0" min="0" value="'+x.valore+'">'
    +'<button type="button" class="rdel" title="Rimuovi"><i data-lucide="trash-2"></i></button>';
  return d;
}
function rowDetail(dta){
  dta=dta||{name:'',ticker:'',value:'',cost:''};
  const r=document.createElement('div');
  r.className='row pd-row'; r.style.gridTemplateColumns='1.4fr .6fr .8fr .8fr 40px';
  r.innerHTML='<input type="text" class="d-name" placeholder="es. VWCE" value="'+esc(dta.name)+'">'
    +'<input type="text" class="d-ticker" placeholder="opz." value="'+esc(dta.ticker)+'">'
    +'<input type="number" class="d-val" placeholder="0" min="0" value="'+dta.value+'">'
    +'<input type="number" class="d-cost" placeholder="opz." min="0" value="'+dta.cost+'">'
    +'<button type="button" class="rdel" title="Rimuovi"><i data-lucide="trash-2"></i></button>';
  return r;
}
/* --- card pilastro --- */
function pillarCardHTML(p,i){
  return '<div class="pillar-card" data-k="'+p.k+'">'
    +'<div class="pc-main">'
      +'<div class="pc-idx">P'+(i+1)+'</div>'
      +'<div class="pc-ico"><i data-lucide="'+p.icon+'" style="width:20px;height:20px"></i></div>'
      +'<div><div class="pc-name">'+p.nome+'</div><div class="pc-sub">'+PILLAR_HELP[p.k]+'</div></div>'
      +'<div class="pc-amt"><span class="eur">€</span><input type="number" class="p-amt" min="0" placeholder="0"></div>'
      +'<div class="pc-pct" data-pct>—</div>'
    +'</div>'
    +'<div class="pc-det">'
      +'<button type="button" class="pc-toggle">Dettaglia le posizioni (opzionale)</button>'
      +'<div class="pd-wrap" hidden>'
        +'<div class="rowhead" style="grid-template-columns:1.4fr .6fr .8fr .8fr 40px;margin-bottom:6px"><span>Nome</span><span>Ticker</span><span>Valore €</span><span>Costo €</span><span></span></div>'
        +'<div class="rows pd-rows"></div>'
        +'<button type="button" class="btn ghost small pd-add" style="margin-top:10px"><i data-lucide="plus"></i> posizione</button>'
        +'<div class="pd-sum"></div>'
      +'</div>'
    +'</div>'
  +'</div>';
}
function renderPillars(){
  $('#pillars').innerHTML=PILLARS.map((p,i)=>pillarCardHTML(p,i)).join('');
}
function pillarCardEl(k){ return document.querySelector('.pillar-card[data-k="'+k+'"]'); }
function addDetail(k,dta){
  const card=pillarCardEl(k);
  card.querySelector('.pd-rows').appendChild(rowDetail(dta));
  card.querySelector('.pd-wrap').hidden=false;
  refreshIcons(); updPdSum(card);
}
function updPdSum(card){
  const tot=parseNum((card.querySelector('.p-amt')||{}).value);
  const dets=qsa('.pd-row',card);
  const el=card.querySelector('.pd-sum');
  if(!dets.length){ el.textContent=''; el.className='pd-sum'; return; }
  const ds=sum(dets.map(r=>parseNum(r.querySelector('.d-val').value)));
  if(tot<=0){ el.textContent='Inserisci prima il totale del pilastro.'; el.className='pd-sum no'; return; }
  const diff=ds-tot;
  if(Math.abs(diff)<=1){ el.textContent='Dettaglio coerente: '+fmtE(ds)+' = totale del pilastro.'; el.className='pd-sum ok'; }
  else if(diff<0){ el.textContent='Dettagliato '+fmtE(ds)+' su '+fmtE(tot)+': il residuo ('+fmtE(-diff)+') sarà trattato come «altre posizioni».'; el.className='pd-sum'; }
  else { el.textContent='Il dettaglio supera il totale di '+fmtE(diff)+': verrà usato il valore totale del pilastro.'; el.className='pd-sum no'; }
}
function updatePillarLive(){
  const amounts={}; let ftot=0;
  qsa('.pillar-card').forEach(card=>{
    const v=parseNum(card.querySelector('.p-amt').value);
    amounts[card.dataset.k]=v; ftot+=v;
  });
  qsa('.pillar-card').forEach(card=>{
    const v=amounts[card.dataset.k];
    card.querySelector('[data-pct]').innerHTML = v>0 && ftot>0 ? fmtP(v/ftot)+'<br>del portafoglio' : '—';
  });
  $('#o-fintot').textContent=fmtE(ftot);
  return ftot;
}
function updateRealeLive(){
  const casaOn=$('#rw-casa').checked, autoOn=$('#rw-auto').checked;
  $('#card-casa').classList.toggle('off',!casaOn);
  $('#card-auto').classList.toggle('off',!autoOn);
  const hv=casaOn?parseNum($('#f-homev').value):0, hm=casaOn?parseNum($('#f-homem').value):0;
  const av=autoOn?parseNum($('#f-carv').value):0, al=autoOn?parseNum($('#f-carl').value):0;
  $('#eq-casa').textContent=casaOn?'equity '+fmtE(Math.max(0,hv-hm)):'disattivato';
  $('#eq-auto').textContent=autoOn?'equity '+fmtE(Math.max(0,av-al)):'disattivato';
  let imm=hv+av, deb=hm+al;
  qsa('#extra-rows .row').forEach(r=>{
    const v=parseNum(r.querySelector('.x-val').value);
    if(r.querySelector('.x-tipo').value==='debito') deb+=v; else imm+=v;
  });
  const ftot=updatePillarLive();
  $('#o-networth').innerHTML='Immobilizzato <b>'+fmtE(imm)+'</b> · Debiti <b>'+fmtE(deb)+'</b> · Patrimonio netto <b>'+fmtE(ftot+imm-deb)+'</b>';
}
function updateLive(){
  $('#o-stab').textContent=STAB_L(+$('#f-stab').value);
  const inc=parseNum($('#f-inc').value)+parseNum($('#f-inc2').value);
  $('#o-inc-ann').textContent=fmtE(inc*12);
  $('#o-totsp').textContent=fmtE(parseNum($('#f-ess').value)+parseNum($('#f-disc').value));
  updateProfileLive();
  updateAgeLive();
  updateCryptoLive();
  updateRealeLive();
}
/* --- raccolta input --- */
function readGoalsList(){
  return qsa('#goal-rows .goal-row').map(r=>({
    nome:r.querySelector('.g-name').value.trim()||'Obiettivo',
    importo:parseNum(r.querySelector('.g-amt').value),
    mesi:Math.max(1,parseNum(r.querySelector('.g-months').value)||1),
  }));
}
function readPillarHoldings(){
  const out=[];
  qsa('.pillar-card').forEach(card=>{
    const k=card.dataset.k, p=Pk[k];
    const tot=parseNum(card.querySelector('.p-amt').value);
    if(tot<=0) return;
    const dets=qsa('.pd-row',card).map(r=>({
      name:r.querySelector('.d-name').value.trim(),
      ticker:r.querySelector('.d-ticker').value.trim(),
      value:parseNum(r.querySelector('.d-val').value),
      cost:r.querySelector('.d-cost').value===''?null:parseNum(r.querySelector('.d-cost').value),
    })).filter(d=>d.value>0);
    const dsum=sum(dets.map(d=>d.value));
    if(dets.length && dsum>0 && dsum<=tot){
      dets.forEach(d=>out.push({name:d.name||'Posizione', category:k, ticker:d.ticker, value:d.value, cost:d.cost}));
      const res=tot-dsum;
      if(res>1) out.push({name:p.nome+' (altre posizioni)', category:k, ticker:'', value:res, cost:null});
    } else {
      out.push({name:p.nome, category:k, ticker:'', value:tot, cost:null});
    }
  });
  return out;
}
function collectInput(){
  return {
    eta:clamp(parseNum($('#f-eta').value)||30,18,90),
    // Il motore conserva la convenzione storica (1 = aggressivo); la UI mostra
    // invece il profilo naturale (1 = sicurezza, 10 = rischio).
    avversione:11-(+$('#f-avv').value),
    cryptoMode:['no','std','bro'][+$('#f-crypto').value]||'std',
    reddito:{ mensile:parseNum($('#f-inc').value), altro:parseNum($('#f-inc2').value), stabilita:+$('#f-stab').value },
    spese:{ essenziali:parseNum($('#f-ess').value), discrezionali:parseNum($('#f-disc').value) },
    obiettivi:readGoalsList(),
    reale:{
      casa:{on:$('#rw-casa').checked, valore:parseNum($('#f-homev').value), mutuo:parseNum($('#f-homem').value)},
      auto:{on:$('#rw-auto').checked, valore:parseNum($('#f-carv').value), fin:parseNum($('#f-carl').value)},
      extra:qsa('#extra-rows .row').map(r=>({
        tipo:r.querySelector('.x-tipo').value,
        nome:r.querySelector('.x-nome').value.trim()||'Voce',
        valore:parseNum(r.querySelector('.x-val').value),
      })).filter(x=>x.valore>0),
    },
    holdings:readPillarHoldings(),
  };
}
function updateSummary(){
  const i=collectInput();
  const fut=sum(i.obiettivi.map(o=>o.importo));
  const re=computeReale(i.reale);
  const ftot=sum(i.holdings.map(h=>h.value));
  const pil=PILLARS.map(p=>{ const v=sum(i.holdings.filter(h=>h.category===p.k).map(h=>h.value)); return p.breve+' '+fmtE(v); }).join(' · ');
  const ps=calculatePACSuggestion(i);
  $('#summary').innerHTML=[
    ['Profilo', i.eta+' anni · profilo '+(11-i.avversione)+'/10 ('+BP_ZONES[Math.ceil((11-i.avversione)/2)-1].name.toLowerCase()+')'],
    ['Esposizione crypto', CONFIG.cryptoModeLabel[i.cryptoMode]||i.cryptoMode],
    ['Reddito', fmtE(i.reddito.mensile+i.reddito.altro)+'/mese · stabilità '+i.reddito.stabilita+'/10'],
    ['Spese', fmtE(i.spese.essenziali+i.spese.discrezionali)+'/mese (essenziali '+fmtE(i.spese.essenziali)+')'],
    ['PAC calcolato dal motore', fmtE(ps.suggerito)+'/mese (90% della capacità di '+fmtE(Math.max(0,ps.capacity))+')'],
    ['Obiettivi futuri', i.obiettivi.length+' voci · '+fmtE(fut)],
    ['Immobilizzato / Debiti', fmtE(re.imm)+' / '+fmtE(re.deb)],
    ['Patrimonio netto', fmtE(ftot+re.imm-re.deb)],
    ['I 5 pilastri', pil],
    ['Patrimonio finanziario', fmtE(ftot)],
  ].map(r=>'<div class="srow"><span>'+r[0]+'</span><b>'+r[1]+'</b></div>').join('');
}
function showWerr(m){ const e=$('#werr'); e.textContent=m; e.classList.add('show'); window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}); }
function loadExample(){
  $('#f-eta').value=32; $('#f-crypto').value=1;
  $('#f-inc').value=2600; $('#f-inc2').value=0; $('#f-stab').value=7;
  $('#f-ess').value=1000; $('#f-disc').value=400;
  $('#rw-casa').checked=true; $('#f-homev').value=190000; $('#f-homem').value=118000;
  $('#rw-auto').checked=true; $('#f-carv').value=14000; $('#f-carl').value=6000;
  const xr=$('#extra-rows'); xr.innerHTML='';
  xr.appendChild(rowExtra({tipo:'bene', nome:'Oggetti di valore', valore:2500}));
  const gr=$('#goal-rows'); gr.innerHTML='';
  [['Vacanza',3000,6],['Auto',8000,12],['Casa (acconto)',20000,84]].forEach(g=>gr.appendChild(rowGoal({nome:g[0],importo:g[1],mesi:g[2]})));
  const bil=PRESETS.find(p=>p.id==='bilanciato');
  activePreset='bilanciato';
  renderPillars();
  PILLARS.forEach(pd=>{ pillarCardEl(pd.k).querySelector('.p-amt').value=bil.pil[pd.k]||0; });
  Object.keys(bil.det||{}).forEach(k=>{ (bil.det[k]||[]).forEach(d=>addDetail(k,{name:d[0],ticker:d[1],value:d[2],cost:d[3]})); });
  renderBPZones(); $('#f-avv').value=bil.prof.avv;
  renderPresets(); updateLive(); refreshIcons();
}

/* ============================================================
   Grafici SVG
   ============================================================ */
function miniStacked(pct,h){
  h=h||26; const W=1000; let x=0, rects='';
  PILLARS.forEach(p=>{ const w=Math.max(0,(pct[p.k]||0)*W); rects+='<rect x="'+x.toFixed(1)+'" y="0" width="'+w.toFixed(1)+'" height="'+h+'" fill="'+p.c+'"/>'; x+=w; });
  return '<svg viewBox="0 0 '+W+' '+h+'" style="width:100%;height:auto;display:block;border:1px solid var(--line)">'+rects+'</svg>';
}
function ribbonChart(curPct, tgtPct, curTot, tgtTot){
  const W=1000, barH=58, topY=40, midGap=120, botY=topY+barH+midGap, H=botY+barH+34;
  const segs=pc=>{ let x=0; return PILLARS.map(p=>{ const w=Math.max(0,(pc[p.k]||0)*W); const s={x0:x,x1:x+w,c:p.c,k:p.k}; x+=w; return s; }); };
  const S1=segs(curPct), S2=segs(tgtPct);
  const lab=(s,y)=>{
    const w=s.x1-s.x0; if(w<=60) return '';
    const tc=s.k==='cash'?'#1B1912':'#F3F0E7';
    return '<text x="'+((s.x0+s.x1)/2).toFixed(1)+'" y="'+(y+26)+'" font-size="12.5" font-weight="600" text-anchor="middle" fill="'+tc+'">'+Pk[s.k].breve+'</text>'
      +'<text x="'+((s.x0+s.x1)/2).toFixed(1)+'" y="'+(y+42)+'" font-size="11" text-anchor="middle" fill="'+tc+'" opacity=".8">'+fmtP(w/W)+'</text>';
  };
  let rib='';
  for(let i=0;i<5;i++){
    const a=S1[i], b=S2[i], y1=topY+barH, y2=botY, my=(y1+y2)/2;
    rib+='<path d="M '+a.x0.toFixed(1)+' '+y1+' C '+a.x0.toFixed(1)+' '+my+', '+b.x0.toFixed(1)+' '+my+', '+b.x0.toFixed(1)+' '+y2+' L '+b.x1.toFixed(1)+' '+y2+' C '+b.x1.toFixed(1)+' '+my+', '+a.x1.toFixed(1)+' '+my+', '+a.x1.toFixed(1)+' '+y1+' Z" fill="'+a.c+'" opacity="0.16"/>';
  }
  const rects=(S,y)=>S.map(s=>'<rect x="'+s.x0.toFixed(1)+'" y="'+y+'" width="'+Math.max(0,s.x1-s.x0-1).toFixed(1)+'" height="'+barH+'" fill="'+s.c+'"/>').join('');
  return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">'
    +'<text x="0" y="'+(topY-14)+'" font-size="11" letter-spacing="2" fill="#57523F">OGGI</text>'
    +'<text x="'+W+'" y="'+(topY-14)+'" font-size="12" text-anchor="end" fill="#1B1912" font-weight="600">'+fmtE(curTot)+'</text>'
    +'<rect x="0" y="'+topY+'" width="'+W+'" height="'+barH+'" fill="rgba(27,25,18,.05)"/>'+rects(S1,topY)+S1.map(s=>lab(s,topY)).join('')
    +rib
    +'<text x="0" y="'+(botY-14)+'" font-size="11" letter-spacing="2" fill="#57523F">TARGET</text>'
    +'<text x="'+W+'" y="'+(botY-14)+'" font-size="12" text-anchor="end" fill="#1B1912" font-weight="600">'+fmtE(tgtTot)+'</text>'
    +'<rect x="0" y="'+botY+'" width="'+W+'" height="'+barH+'" fill="rgba(27,25,18,.05)"/>'+rects(S2,botY)+S2.map(s=>lab(s,botY)).join('')
    +'</svg>';
}
function projectionChart(att,tgt){
  const W=1000,H=330,L=84,Rp=16,T=18,B=36,n=att.length;
  let mx=0; for(let i=0;i<n;i++){ mx=Math.max(mx,att[i],tgt[i]); }
  mx=niceCeil(mx);
  const X=i=>L+(i/(n-1))*(W-L-Rp), Y=v=>T+(1-v/mx)*(H-T-B);
  const path=a=>a.map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1)).join(' ');
  let g='';
  [0,0.25,0.5,0.75,1].forEach(k=>{
    const y=Y(mx*k).toFixed(1);
    g+='<line x1="'+L+'" y1="'+y+'" x2="'+(W-Rp)+'" y2="'+y+'" stroke="var(--line)"/>'
      +'<text x="'+(L-8)+'" y="'+(+y+4)+'" font-size="10.5" text-anchor="end" fill="#57523F">'+fmtK(mx*k)+'</text>';
  });
  [0,5,10,15,20,25,30].forEach(yr=>{ if(yr<n) g+='<text x="'+X(yr).toFixed(1)+'" y="'+(H-12)+'" font-size="10.5" text-anchor="middle" fill="#57523F">+'+yr+'a</text>'; });
  const endT=tgt[n-1], endA=att[n-1];
  return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">'
    +g
    +'<path d="'+path(att)+'" fill="none" stroke="#57523F" stroke-width="2" stroke-dasharray="6 4" opacity=".85"/>'
    +'<path d="'+path(tgt)+'" fill="none" stroke="var(--c4)" stroke-width="2.6"/>'
    +'<circle cx="'+X(n-1).toFixed(1)+'" cy="'+Y(endT).toFixed(1)+'" r="4" fill="var(--c4)"/>'
    +'<circle cx="'+X(n-1).toFixed(1)+'" cy="'+Y(endA).toFixed(1)+'" r="4" fill="#57523F"/>'
    +'<text x="'+(X(n-1)-8).toFixed(1)+'" y="'+(Y(endT)-9).toFixed(1)+'" font-size="11" text-anchor="end" fill="var(--c4)" font-weight="600">'+fmtK(endT)+'</text>'
    +'<text x="'+(X(n-1)-8).toFixed(1)+'" y="'+(Y(endA)+17).toFixed(1)+'" font-size="11" text-anchor="end" fill="#57523F">'+fmtK(endA)+'</text>'
    +'</svg>';
}
function timelineSVG(goals){
  if(!goals.length) return '<p class="hint">Nessun obiettivo inserito: l\u2019intero patrimonio finanziario è trattato come capitale di lungo termine.</p>';
  const T=Math.max(10, Math.ceil(Math.max.apply(null,goals.map(g=>g.mesi))/12)+2);
  const W=1000,H=190,pad=30;
  const X=m=>pad+(m/12/T)*(W-2*pad);
  let s='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">'
    +'<line x1="'+pad+'" y1="'+(H-56)+'" x2="'+(W-pad)+'" y2="'+(H-56)+'" stroke="var(--ink)" stroke-width="2"/>';
  for(let y=0;y<=T;y+=(T>15?2:1)){
    s+='<line x1="'+X(y*12)+'" y1="'+(H-56)+'" x2="'+X(y*12)+'" y2="'+(H-50)+'" stroke="var(--ink)" stroke-width="1"/>'
      +'<text x="'+X(y*12)+'" y="'+(H-34)+'" font-size="10.5" text-anchor="middle" fill="#57523F">'+(new Date().getFullYear()+y)+'</text>';
  }
  const BC={immediato:'var(--c1)',breve:'var(--c2)',medio:'var(--c3)',lungo:'var(--c4)'};
  goals.slice().sort((a,b)=>a.mesi-b.mesi).forEach((g,i)=>{
    const up=i%2===0, cy=up?46:104, cx=X(g.mesi);
    const r=clamp(Math.sqrt(g.importo)/22,7,20);
    s+='<line x1="'+cx+'" y1="'+(H-56)+'" x2="'+cx+'" y2="'+(cy+(up?r:-r))+'" stroke="var(--line2)" stroke-dasharray="3 3"/>'
      +'<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+BC[g.bucket]+'" opacity=".85"/>'
      +'<text x="'+cx+'" y="'+(up?cy-24:cy+r+16)+'" font-size="11" text-anchor="middle" fill="#1B1912" font-weight="600">'+esc(g.nome)+' · '+fmtE(g.importo)+'</text>';
  });
  s+='<text x="'+(W-pad)+'" y="'+(H-8)+'" font-size="10.5" text-anchor="end" fill="#57523F" letter-spacing="1.5">OLTRE → CAPITALE DI LUNGO TERMINE</text></svg>';
  return s;
}
function gaugeHTML(cur,tgt){
  const mk=(v,l)=>'<div class="mk" style="left:'+clamp(v,0,100)+'%" data-l="'+l+' '+v+'"></div>';
  return '<div class="gauge"><div class="z1"></div><div class="z2"></div><div class="z3"></div>'+mk(cur,'OGGI')+mk(tgt,'TARGET')+'</div>'
    +'<div class="gzl"><span>0 · prudente</span><span>35</span><span>65</span><span>100 · aggressivo</span></div>';
}

/* ============================================================
   Scroll-spy + auto-centraggio del menu orizzontale + freccia
   ============================================================ */
let spyState=null;
function killScrollSpy(){
  if(!spyState) return;
  if(spyState.scrollFrame) cancelAnimationFrame(spyState.scrollFrame);
  window.removeEventListener('scroll', spyState.onScroll);
  window.removeEventListener('resize', spyState.onResize);
  spyState.wrap.removeEventListener('scroll', spyState.onWrapScroll);
  spyState.arrow.removeEventListener('click', spyState.onArrow);
  spyState=null;
}
function wireScrollSpy(ids){
  killScrollSpy();
  const wrap=$('#resnav-links');
  const spy=$('#resnav-spy');
  const arrow=$('#nav-arrow');
  if(!wrap||!spy||!arrow) return;
  const links={};
  qsa('a',wrap).forEach(a=>{ links[a.getAttribute('href').slice(1)]=a; });
  const centerOn=el=>{
    const target=el.offsetLeft - (wrap.clientWidth - el.offsetWidth)/2;
    wrap.scrollTo({left:Math.max(0,target), behavior:'smooth'});
  };
  const moveSpy=()=>{
    const el=wrap.querySelector('a.cur');
    if(!el){ spy.classList.remove('on'); return; }
    spy.style.left=el.offsetLeft+'px';
    spy.style.width=el.offsetWidth+'px';
    spy.classList.add('on');
  };
  const updateArrow=()=>{
    const more=wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 8;
    arrow.classList.toggle('show', more);
  };
  const setActive=id=>{
    let changed=false;
    Object.keys(links).forEach(k=>{
      const want=(k===id);
      if(links[k].classList.contains('cur')!==want){ links[k].classList.toggle('cur',want); changed=true; }
      if(want) links[k].setAttribute('aria-current','page');
      else links[k].removeAttribute('aria-current');
    });
    if(changed){
      moveSpy();
      const el=links[id];
      if(el) centerOn(el);
    }
  };
  const updateActive=()=>{
    let curId=ids[0];
    const marker=145;
    let bestDistance=Infinity;
    for(const id of ids){
      const el=document.getElementById(id);
      if(!el) continue;
      const rect=el.getBoundingClientRect();
      const distance=Math.abs(rect.top-marker);
      if(rect.top<=marker) curId=id;
      if(rect.top<=marker && distance<bestDistance){ bestDistance=distance; curId=id; }
    }
    setActive(curId);
  };
  const onScroll=updateActive;
  const onArrow=()=>{
    const edge=wrap.scrollLeft + wrap.clientWidth;
    let next=null;
    qsa('a',wrap).forEach(a=>{
      if(a.offsetLeft + a.offsetWidth > edge && !next) next=a;
    });
    if(next) centerOn(next);
    else wrap.scrollTo({left:0, behavior:'smooth'});
  };
  const onResize=()=>{ onScroll(); updateArrow(); moveSpy(); };
  spyState={onScroll, onArrow, onWrapScroll:updateArrow, onResize, arrow, wrap};
  window.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('resize', onResize);
  wrap.addEventListener('scroll', updateArrow, {passive:true});
  arrow.addEventListener('click', onArrow);
  setActive(ids[0]);
  onScroll(); updateArrow();
}

/* ============================================================
   Render — dashboard risultati
   ============================================================ */
function secHTML(num,id,title,body,desc){
  return '<section class="sec" id="'+id+'"><div class="sec-head"><span class="sec-num">'+num+'</span><h2 class="sec-title">'+title+'</h2></div>'
    +(desc?'<p class="sec-desc">'+desc+'</p>':'')+body+'</section>';
}
function pacSplitRows(pacObj){
  if(!pacObj || !pacObj.split.length) return '<p class="hint">Nessuna allocazione necessaria con questo importo: tutti i pilastri sono nei range.</p>';
  return pacObj.split.map(s=>'<div class="pacrow"><div style="font-size:13.5px"><b>'+Pk[s.k].nome+'</b><div class="peur">'+s.motivo+'</div></div><div class="tr"><div class="fl" style="width:'+(s.amount/pacObj.mensile*100).toFixed(1)+'%;background:'+Pk[s.k].c+'"></div></div><div class="num" style="text-align:right;font-weight:600">'+fmtE(s.amount)+'</div></div>').join('');
}
function pillarDetailHTML(p, r){
  const curPctW=r.curPct*100, tgPctW=r.tgtPct*100;
  const rl=Math.max(0, tgPctW-3), rr=Math.min(100, tgPctW+3);
  const dev=r.gapPp, devAbs=Math.abs(dev);
  const devSign=dev>=0?'+':'−';
  const stTxt=r.status==='ok'?'NEL RANGE':(r.dir==='sopra'?'SOPRA IL TARGET':'SOTTO IL TARGET');
  const stCls=r.status==='ok'?'green':(r.status==='mild'?'amber':'red');
  const grad=r.status==='ok'?'nel range adeguato':(r.status==='mild'?'scostamento lieve':'scostamento forte');
  const azione=r.status==='ok'
    ? 'Nessuna azione: resta nel range adeguato. Non toccare.'
    : (r.dir==='sopra'
      ? 'Riduci: l\u2019eccesso è già nel piano (sezione Piano di riallocazione) diretto verso i pilastri sotto-pesati.'
      : 'Aumenta: destinaci i nuovi versamenti (PAC) prima di considerare qualsiasi vendita.');
  const fillCol=r.status==='ok'?'var(--ok)':(r.status==='mild'?'var(--warn)':'var(--bad)');
  const showLab=curPctW>=8;
  const idx=PILLARS.indexOf(PILLARS.find(x=>x.k===r.k))+1;
  const bar='<div class="pbar">'
    +'<div class="pbar-range" style="left:'+rl.toFixed(1)+'%;width:'+(rr-rl).toFixed(1)+'%"></div>'
    +'<div class="pbar-fill" style="width:'+Math.min(100,curPctW).toFixed(1)+'%;background:'+fillCol+'"></div>'
    +'<div class="pbar-mark" style="left:'+Math.min(100,tgPctW).toFixed(1)+'%"></div>'
    +(showLab?'<span class="pbar-lab" style="left:'+Math.min(99,curPctW-0.6).toFixed(1)+'%">oggi '+fmtP(r.curPct)+'</span>':'')
    +'</div>'
    +'<div class="pbar-scale"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100% del patrimonio</span></div>'
    +'<p class="hint" style="margin-top:8px">Zona tratteggiata = range adeguato ('+fmtP(rl/100)+' – '+fmtP(rr/100)+') · linea nera = target ('+fmtP(r.tgtPct)+') · riempimento = peso attuale. '+(r.dir==='sopra'?'Il riempimento supera la linea: sei sopra il target.':(r.dir==='sotto'?'Il riempimento non arriva alla linea: sei sotto il target.':'Il riempimento tocca la zona adeguata.'))+'</p>';
  return '<div class="pdet">'
    +'<div class="pdet-head"><div><span class="pdet-idx">P'+idx+'</span><span class="pdet-name">'+Pk[r.k].nome+'</span></div>'
    +'<span class="chip '+stCls+'">'+stTxt+'</span></div>'
    +'<div class="split" style="gap:32px">'
      +'<div>'
        +'<div style="display:flex;align-items:baseline"><span class="pdet-score">'+devSign+devAbs.toLocaleString('it-IT',{maximumFractionDigits:1})+'</span><span class="pdet-pp">pp dal target</span></div>'
        +'<div class="pdet-dir">'+grad+' · '+(r.gapEur>=0.5?'eccesso '+fmtE(r.gapEur):(r.gapEur<=-0.5?'mancanza '+fmtE(-r.gapEur):'gap trascurabile'))+'</div>'
        +bar
      +'</div>'
      +'<div>'
        +'<div class="stat-row"><span class="sk">Attuale</span><span class="sv">'+fmtE(r.cur)+' · '+fmtP(r.curPct)+'</span></div>'
        +'<div class="stat-row"><span class="sk">Target del modello</span><span class="sv">'+fmtE(r.tgt)+' · '+fmtP(r.tgtPct)+'</span></div>'
        +'<div class="stat-row"><span class="sk">Rendimento atteso (info)</span><span class="sv">r = '+CONFIG.rendInfo[r.k]+'</span></div>'
        +'<p class="hint" style="margin-top:10px">'+REND_NOTE[r.k]+' Il calcolo della crescita usa il valore puntuale di riferimento dentro questo range.</p>'
        +'<div class="azione"><i data-lucide="compass"></i><span>'+azione+'</span></div>'
      +'</div>'
    +'</div>'
  +'</div>';
}
function renderResults(R){
  const fin=R.fin, gap=R.gap, tgt=R.tgt, reb=R.reb, input=R.input;
  const mode=input.cryptoMode||'std';

  const invAtt=gap.cur.bond+gap.cur.etf+gap.cur.risk;
  const invTgt=tgt.values.bond+tgt.values.etf+tgt.values.risk;
  const invAttPct=fin>0?invAtt/fin:0, invTgtPct=tgt.pct.bond+tgt.pct.etf+tgt.pct.risk;

  let html='<div class="rhead"><div><div class="kicker">Report di allocazione patrimoniale · modalità crypto: '+(CONFIG.cryptoModeLabel[mode]||mode)+'</div><h1>Il tuo portafoglio</h1></div>'
    +'<div class="stamp">Analisi del '+new Date().toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'})+'</div></div>'
    +R.warnings.map(w=>'<div class="banner red show"><i data-lucide="alert-triangle"></i><span>'+w+'</span></div>').join('')
    +R.notices.map(n=>'<div class="banner show"><i data-lucide="info"></i><span>'+n+'</span></div>').join('')
    +'<div class="ledger">'
      +'<div><div class="ll">Situazione attuale</div><div class="ln">'+fmtE(fin)+'</div><div class="ls">'+input.holdings.length+' posizioni · patrimonio finanziario</div></div>'
      +'<div><div class="ll">Indice di rischio</div><div class="ln">'+R.rCur+'<span class="arr"> → </span><span style="color:var(--c4)">'+R.rTgt+'</span><small> /100</small></div><div class="ls">portfolio risk score · attuale → target</div></div>'
      +'<div><div class="ll">Investito (bond+stocks+crypto)</div><div class="ln">'+fmtE(invAtt)+'<span class="arr"> → </span><span style="color:var(--c4)">'+fmtE(invTgt)+'</span></div><div class="ls">senza liquidità e conto deposito · oggi '+fmtP(invAttPct)+' → target '+fmtP(invTgtPct)+' del patrimonio</div></div>'
      +'<div><div class="ll">Capitale da riallocare</div><div class="ln">'+fmtE(reb.capitaleRiallocato)+'</div><div class="ls">'+(reb.taxUnknown?'impatto fiscale parziale da verificare':'costi stimati inclusi')+'</div></div>'
      +'<div><div class="ll">Operazioni consigliate</div><div class="ln">'+reb.opsCount+'</div><div class="ls">vendite + spostamenti · minimo possibile</div></div>'
    +'</div>';

  /* 01 · patrimonio */
  const reRows=[];
  if(input.reale.casa.on) reRows.push('<div class="stat-row"><span class="sk">Casa</span><span class="sv">'+fmtE(input.reale.casa.valore)+' <span class="chip '+(input.reale.casa.mutuo>0?'amber':'')+'">mutuo '+fmtE(input.reale.casa.mutuo)+'</span></span></div>');
  if(input.reale.auto.on) reRows.push('<div class="stat-row"><span class="sk">Auto</span><span class="sv">'+fmtE(input.reale.auto.valore)+' <span class="chip '+(input.reale.auto.fin>0?'amber':'')+'">residuo '+fmtE(input.reale.auto.fin)+'</span></span></div>');
  input.reale.extra.forEach(x=>reRows.push('<div class="stat-row"><span class="sk">'+esc(x.nome)+'</span><span class="sv">'+(x.tipo==='debito'?'Debito ':'Bene ')+fmtE(x.valore)+'</span></div>'));
  if(!reRows.length) reRows.push('<div class="stat-row"><span class="sk">Nessun bene immobilizzato dichiarato</span><span class="sv">—</span></div>');
  const lordo=fin+R.imm;
  html+=secHTML('01','s-pat','Patrimonio',
    '<div class="split"><div>'
      +'<div class="bigline">'+fmtE(R.netWorth)+'</div>'
      +'<div class="stat-row"><span class="sk">Patrimonio finanziario (investibile)</span><span class="sv">'+fmtE(fin)+'</span></div>'
      +'<div class="stat-row"><span class="sk">Patrimonio immobilizzato (casa, auto, altro)</span><span class="sv">'+fmtE(R.imm)+'</span></div>'
      +'<div class="stat-row"><span class="sk">Passività (mutui, finanziamenti, debiti)</span><span class="sv">−'+fmtE(R.deb)+'</span></div>'
      +'<p class="hint" style="margin-top:14px">Il patrimonio immobilizzato non è considerato capitale investibile: incide però su concentrazione e rischio complessivo (quota '+fmtP(lordo>0?R.imm/lordo:0)+' del patrimonio lordo).</p>'
    +'</div><div>'
      +'<div class="kicker" style="margin-bottom:10px">COMPOSIZIONE DEL PATRIMONIO LORDO</div>'
      +'<div style="display:flex;height:26px;border:1px solid var(--line2);overflow:hidden">'
        +'<div style="width:'+(lordo>0?fin/lordo*100:0).toFixed(1)+'%;background:var(--c4)"></div>'
        +'<div style="flex:1;background:var(--c1)"></div>'
      +'</div>'
      +'<div class="gzl" style="margin-top:6px"><span><span class="dot" style="background:var(--c4)"></span>finanziario '+fmtP(lordo>0?fin/lordo:0)+'</span><span><span class="dot" style="background:var(--c1)"></span>immobilizzato '+fmtP(lordo>0?R.imm/lordo:0)+'</span></div>'
      +'<div style="margin-top:18px">'+reRows.join('')+'</div>'
    +'</div></div>');

  /* 02 · sicurezza */
  const liq=R.liq;
  const liqStatus={ok:['ok','ADEGUATO'],warn:['warn','DA MIGLIORARE'],bad:['bad','INSUFFICIENTE']}[liq.status];
  const barW=Math.min(100,liq.mesi/(R.ef.mesi*1.5)*100), barN=Math.min(100,R.ef.mesi/(R.ef.mesi*1.5)*100);
  html+=secHTML('02','s-sic','Sicurezza',
    '<div class="split"><div>'
      +'<div class="bigline">'+fmtE(R.ef.totale)+'</div>'
      +'<p class="hint" style="margin-bottom:18px">Fondo emergenza: '+fmtE(input.spese.essenziali)+' di spese essenziali × '+R.ef.mesi+' mesi (stabilità reddito '+input.reddito.stabilita+'/10, profilo '+(11-input.avversione)+'/10).</p>'
      +'<div class="stat-row"><span class="sk">Quanti mesi puoi sopravvivere senza reddito?</span><span class="sv">'+liq.mesi.toLocaleString('it-IT',{maximumFractionDigits:1})+' mesi</span></div>'
      +'<div class="stat-row"><span class="sk">Liquidità disponibile (P1 + P2)</span><span class="sv">'+fmtE(liq.liq)+'</span></div>'
      +'<div class="stat-row"><span class="sk">Riserva + obiettivi ≤ 36 mesi (target)</span><span class="sv">'+fmtE(liq.necessario)+'</span></div>'
      +'<div class="stat-row"><span class="sk">Spese future a medio termine coperte</span><span class="sv">'+(R.fut.protetto>0?fmtP(Math.min(1,fin/R.fut.protetto)):'—')+'</span></div>'
      +(liq.status!=='ok'?'<div class="inline-warn show" style="margin-top:16px"><i data-lucide="alert-triangle"></i><span>La riserva attuale non copre il fondo emergenza consigliato ('+R.ef.mesi+' mesi). Il piano destina i prossimi capitali prima della sicurezza.</span></div>':'')
    +'</div><div>'
      +'<div class="chart-cap" style="margin-bottom:10px">TEST EMERGENZA — <span class="dot '+liqStatus[0]+'"></span>'+liqStatus[1]+'</div>'
      +'<div style="position:relative;height:22px;background:rgba(27,25,18,.07);margin:14px 0 6px">'
        +'<div style="position:absolute;inset:0 auto 0 0;width:'+barW.toFixed(1)+'%;background:'+(liq.status==='ok'?'var(--ok)':liq.status==='warn'?'var(--warn)':'var(--bad)')+'"></div>'
        +'<div style="position:absolute;top:-6px;bottom:-6px;left:'+barN.toFixed(1)+'%;width:2px;background:var(--ink)"></div>'
      +'</div>'
      +'<div class="gzl"><span>0 mesi</span><span>obiettivo '+R.ef.mesi+' mesi (linea verticale)</span><span>'+Math.round(R.ef.mesi*1.5)+'+</span></div>'
      +(liq.eccesso>CONFIG.bande.ticketMinimo*4
        ?'<div class="inline-warn show" style="margin-top:18px"><i data-lucide="info"></i><span>Hai circa <b>'+fmtE(liq.eccesso)+'</b> di liquidità oltre la riserva stimata necessaria. Se questo capitale non è destinato a obiettivi specifici, il piano qui sotto ne propone la riallocazione — ma non è obbligatorio investirlo tutto.</span></div>'
        :'<p class="hint" style="margin-top:18px">Nessuna liquidità in eccesso rilevante oltre alla riserva: condizione corretta.</p>')
    +'</div></div>','Emergency fund, test di sopravvivenza e liquidità in eccesso.');

  /* 03 · pilastri in dettaglio */
  html+=secHTML('03','s-pdet','I pilastri in dettaglio',
    gap.rows.map((r,i)=>pillarDetailHTML(PILLARS[i], r)).join(''),
    'Per ogni pilastro: il punteggio di distacco dal target (0 = in linea), la barra col range adeguato (target ±3% del patrimonio) e il rendimento atteso dichiarato. Verde = adeguato · ambra = lieve · rosso = forte.');

  /* 04 · attuale vs target */
  const curPct={}; PILLARS.forEach(p=>curPct[p.k]=fin>0?gap.cur[p.k]/fin:0);
  html+=secHTML('04','s-target','Attuale vs Target',
    ribbonChart(curPct,tgt.pct,fin,fin)
    +'<div class="legend">'+PILLARS.map(p=>'<span><span class="dot" style="background:'+p.c+'"></span>'+p.nome+'</span>').join('')+'</div>'
    +'<p class="hint" style="margin:14px 0 30px">I nastri collegano ogni pilastro alla sua quota target: più un nastro è largo, più capitale deve spostarsi. Banda di tolleranza: ±3% del patrimonio.</p>'
    +'<div class="tblwrap"><table><tr><th>Pilastro</th><th class="r">Attuale</th><th class="r"></th><th class="r">Target</th><th class="r"></th><th class="r">Gap €</th><th class="r">Gap</th><th>Stato</th></tr>'
    +gap.rows.map(r=>{
      const st={ok:'<span class="dot ok"></span>In linea',mild:'<span class="dot warn"></span>Scostamento lieve ('+r.dir+')',strong:'<span class="dot bad"></span>Fortemente '+(r.dir==='sopra'?'sovra':'sotto')+'pesato'}[r.status];
      return '<tr><td><b>'+Pk[r.k].nome+'</b></td><td class="r">'+fmtE(r.cur)+'</td><td class="r" style="color:var(--ink2)">'+fmtP(r.curPct)+'</td><td class="r">'+fmtE(r.tgt)+'</td><td class="r" style="color:var(--ink2)">'+fmtP(r.tgtPct)+'</td><td class="r">'+fmtEs(-r.gapEur)+'</td><td class="r">'+fmtPs(-r.gapPp)+'</td><td style="font-size:12.5px">'+st+'</td></tr>';
    }).join('')
    +'</table></div>','Portfolio gap per pilastro, con banda di tolleranza del ±3%.');

  /* 05 · cinque pilastri (sintesi) */
  const motto=k=>{
    const f=R.fut.buckets;
    if(k==='cash') return 'Liquidità operativa'+(f.immediato>0?' e spese imminenti ('+fmtE(f.immediato)+')':'')+' per la gestione quotidiana.';
    if(k==='deposit') return 'Riserva per emergenze ('+R.ef.mesi+' mesi)'+(f.breve>0?' e spese previste a breve ('+fmtE(f.breve)+')':'')+'.';
    if(k==='bond') return 'Componente stabilizzatrice'+(f.medio>0?' e capitale per obiettivi di medio periodo ('+fmtE(f.medio)+')':'')+'.'+(mode==='bro'?' Ridotta dalla modalità crypto bro.':(prudenteMature(input)&&mode!=='bro'?' Ingrossata dal profilo difensivo 70-30.':''));
    if(k==='etf') return mode==='no' ? 'Con le crypto disattivate, questo è l\u2019unico motore di crescita: riceve l\u2019intera quota crescita.' : (input.eta<CONFIG.giovane.etaLimite ? 'Con il boost giovanile (età '+input.eta+' < '+CONFIG.giovane.etaLimite+') questo pilastro assorbe quasi tutta la quota crescita.' : 'Motore principale della crescita del capitale nel lungo periodo.');
    if(mode==='no') return 'Hai disattivato le crypto: il target di questo pilastro è zero. Le posizioni esistenti sono segnate per l\u2019uscita nel piano.';
    if(mode==='bro') return 'Modalità crypto bro: tetto '+fmtP(tgt.caps.finale)+' dell\u2019investibile, limiti di età e profilo ignorati, bond strategico ridotto.';
    if(prudenteMature(input)) return 'Profilo difensivo maturi: crypto azzerate automaticamente (età ≥ '+CONFIG.prudenza.etaVecchia+' + profilo ≥ '+CONFIG.prudenza.profiloPrudente+').';
    return 'Componente ad alta volatilità, limitata a '+fmtP(tgt.caps.finale)+' dal profilo (vincolo: '+tgt.caps.binding+').';
  };
  html+=secHTML('05','s-pilastri','I cinque pilastri',
    PILLARS.map((p,i)=>{
      const r=gap.rows[i];
      const st={ok:['ok','IN LINEA'],mild:['warn','REGOLABILE'],strong:['bad',r.dir==='sopra'?'RIDURRE':'AUMENTARE']}[r.status];
      return '<div class="prow"><div class="pidx">P'+(i+1)+'</div><div class="pico"><i data-lucide="'+p.icon+'" style="width:20px;height:20px"></i></div>'
        +'<div><div class="pname">'+p.nome+'</div><div class="pmotto">'+motto(p.k)+'</div></div>'
        +'<div><div class="ppct">'+fmtP(tgt.pct[p.k])+'</div><div class="peur">target '+fmtE(tgt.values[p.k])+'</div></div>'
        +'<div style="text-align:right;font-size:12px"><span class="dot '+st[0]+'"></span>'+st[1]+'<div class="peur">oggi '+fmtP(r.curPct)+' · '+fmtE(r.cur)+'</div></div></div>';
    }).join(''),'Il target derivato dal modello, pilastro per pilastro.');

  /* 06 · piano */
  const goalByBucket=b=>R.fut.items.filter(i=>i.bucket===b).map(i=>i.nome);
  const planItems=[];
  reb.vendite.forEach(v=>{
    const exitMsg = v.exit
      ? (mode==='no' ? 'Hai scelto «No crypto»: uscita completa dalla posizione, graduale e con privilegio delle minusvalenze.' : 'Posizione fortemente incoerente con il profilo target: uscita completa.')
      : 'Il pilastro «'+Pk[v.pillar].nome+'» è sopra il target. Riduzione parziale: la posizione non viene azzerata.';
    planItems.push({tipo:'vendita',
      title:'Vendi '+esc(v.holding.name)+' per '+fmtE(v.amount),
      body: exitMsg,
      meta:'Costo stimato: commissione '+fmtE(v.fee)+(v.tax!=null?(' · ritenuta stimata '+fmtE(v.tax)+' al 26%'+(v.minus?' · minusvalenza: possibile compensazione futura':'')):' · <b style="color:var(--warn)">Potenziale impatto fiscale: da verificare</b>'),
      flow:'<b>'+esc(v.holding.name)+'</b><br>→ liquidità'});
  });
  reb.moves.forEach(m=>{
    const fromL = m.from.tipo==='esterno'?'nuovo versamento' : m.from.holding?('ricavato vendita '+esc(m.from.holding.name)) : Pk[m.from.pillar].nome.toLowerCase();
    const goals=goalByBucket(m.to==='deposit'?'breve':m.to==='bond'?'medio':'immediato');
    planItems.push({tipo:'mossa',
      title:'Sposta '+fmtE(m.amount)+' → '+Pk[m.to].nome,
      body:'Da: '+fromL+'.'+(goals.length?' Destinazione coerente con obiettivo: '+goals.join(', ')+'.':' Ricollocazione verso il pilastro sotto-pesato.'),
      meta: m.from.holding?'Il ricavato della vendita viene impiegato qui.':'Trasferimento diretto: nessuna vendita necessaria.',
      flow:'<b>'+fromL+'</b><br>→ '+Pk[m.to].nome});
  });
  const quietP=gap.rows.filter(r=>r.status==='ok'&&r.k!=='cash'&&r.k!=='deposit').slice(0,3);
  quietP.forEach(r=>planItems.push({tipo:'keep', title:'Non fare nulla su '+Pk[r.k].nome,
    body:'Già nel range target: attuale '+fmtP(r.curPct)+', target '+fmtP(r.tgtPct)+'.', meta:'Nessuna operazione.', flow:''}));
  if(R.pac) planItems.push({tipo:'pac', title:'I prossimi '+fmtE(R.pac.mensile)+' investiti',
    body:'Ripartizione target-aware ('+R.pac.modalita+'): '+(R.pac.split.map(s=>fmtE(s.amount)+' → '+Pk[s.k].nome).join(', ')||'nessuna allocazione necessaria ora')+'. I pilastri sopra target ricevono €0.',
    meta:'Dettaglio completo nella sezione PAC intelligente.', flow:'versamento<br>mensile'});
  html+=secHTML('06','s-piano','Piano di riallocazione',
    '<div class="step3">'
      +'<div><div class="sn">Step 1 — Questa settimana</div><h3>Correggi gli squilibri evidenti</h3><p>'+reb.opsCount+' operazioni in totale, ordinate per priorità. Nessun azzeramento del portafoglio.</p></div>'
      +'<div><div class="sn">Step 2 — Da domani</div><h3>Usa i nuovi versamenti</h3><p>'+(R.pac?fmtE(R.pac.mensile)+'/mese (90% della capacità di risparmio) destinati ai pilastri sotto-pesati, senza vendite. Confronto completo nel <b>PAC intelligente</b>.':'Capacità di risparmio nulla: il piano si basa sulla liquidità esistente.')+'</p></div>'
      +'<div><div class="sn">Step 3 — Poi</div><h3>Mantieni</h3><p>Quando i pilastri rientrano nel ±3%: <b>stop rebalancing</b>. Non modificare continuamente il portafoglio.</p></div>'
    +'</div>'
    +planItems.map((a,i)=>'<div class="action '+(a.tipo==='keep'?'keep':'')+'"><div class="anum">'+(i+1)+'</div><div>'
      +'<div>'+(a.tipo==='vendita'?'<span class="chip red">Vendita</span>':a.tipo==='keep'?'<span class="chip green">Nessuna operazione</span>':a.tipo==='pac'?'<span class="chip solid">PAC</span>':'<span class="chip">Spostamento</span>')+' <span class="chip">Priorità '+(i+1)+'</span></div>'
      +'<h3>'+a.title+'</h3><p>'+a.body+'</p><div class="ameta">'+a.meta+'</div></div>'
      +'<div class="aflow">'+a.flow+'</div></div>').join('')
    +(reb.nota?'<div class="inline-warn show" style="margin-top:18px"><i data-lucide="info"></i><span>'+reb.nota+'</span></div>':'')
    +'<div class="subline" style="margin-top:20px">Costo stimato del piano: <b>'+fmtE(reb.costoVendite)+'</b>'
      +(reb.taxUnknown?' (escluso il potenziale impatto fiscale sulle vendite senza costo di acquisto indicato: <b>da verificare</b>)':'')
      +' · Proiezione post-piano:</div>'
    +'<div style="margin-top:8px;max-width:640px">'+miniStacked(PILLARS.reduce((o,p)=>{o[p.k]=fin>0?reb.proj[p.k]/fin:0;return o;},{}),22)+'</div>',
    '«Cosa farei al tuo posto» — le azioni concrete, in ordine di priorità, col minor numero possibile di operazioni.');

  /* 07 · keep / avoid */
  const notFare=[];
  const keepEtf=reb.keeps.filter(k=>k.h.category==='etf');
  if(keepEtf.length) notFare.push('Non vendere '+keepEtf.map(k=>'<b>'+esc(k.h.name)+'</b>').join(', ')+': già coerenti con il portafoglio target.');
  const overP=gap.rows.filter(r=>r.dir==='sopra'&&r.status!=='ok');
  if(overP.length) notFare.push('Non aumentare ulteriormente: '+overP.map(r=>'<b>'+Pk[r.k].nome+'</b>').join(', ')+' — già sopra target.');
  notFare.push('Non investire il fondo emergenza ('+fmtE(R.ef.totale)+'): è la tua assicurazione contro le vendite forzate.');
  if(R.fut.buckets.breve>0) notFare.push('Non destinare il capitale per obiettivi < 36 mesi ('+fmtE(R.fut.buckets.breve)+') a ETF o crypto.');
  if(mode==='bro') notFare.push('Modalità crypto bro non significa «all-in»: il tetto è '+fmtP(tgt.caps.finale)+' dell\u2019investibile, non oltre. La riserva di emergenza resta intoccata.');
  html+=secHTML('07','s-keep','Da mantenere · Da non fare',
    '<div class="duo"><div><div class="kicker" style="margin-bottom:12px">COSA NON DEVI TOCCARE</div><ul class="tick">'
    +(reb.keeps.length?reb.keeps.map(k=>'<li><i data-lucide="check" style="color:var(--ok)"></i><span><b>'+esc(k.h.name)+'</b> · '+fmtE(k.h.value)+' · '+Pk[k.h.category].nome+'<small>'+esc(k.motivo)+'</small></span></li>').join(''):'<li>Nessuna posizione risulta già in linea: il piano sopra copre tutto.</li>')
    +'</ul></div><div><div class="kicker" style="margin-bottom:12px">COSA NON FARE</div><ul class="tick">'
    +notFare.map(t=>'<li><i data-lucide="x" style="color:var(--bad)"></i><span>'+t+'</span></li>').join('')
    +'</ul></div></div>','La metà silenziosa del piano: evitare l\u2019overtrading è la scelta più redditizia.');

  /* 08 · rischio */
  const dScore=R.rCur-R.rTgt;
  const frase=dScore>8?'Il tuo portafoglio attuale è più aggressivo del profilo che hai indicato.'
    :dScore<-8?'Il tuo portafoglio attuale è più prudente del target che il tuo profilo consentirebbe.'
    :'Il profilo di rischio del portafoglio attuale è sostanzialmente coerente con il target.';
  html+=secHTML('08','s-rischio','Rischio complessivo',
    '<div class="split"><div>'
      +'<div style="display:flex;gap:40px;margin-bottom:6px">'
        +'<div><div class="kicker">Risk score attuale</div><div class="bigline" style="font-size:44px">'+R.rCur+'<span style="font-size:18px;color:var(--ink2)">/100</span></div></div>'
        +'<div><div class="kicker">Risk score target</div><div class="bigline" style="font-size:44px;color:var(--c4)">'+R.rTgt+'<span style="font-size:18px;color:var(--ink2)">/100</span></div></div>'
      +'</div>'
      +gaugeHTML(R.rCur,R.rTgt)
      +'<p style="margin-top:20px;font-size:15.5px"><i data-lucide="info"></i> '+frase
      +(tgt.caps.finale>0 && R.conc.cryptoPct>R.conc.capCrypto*1.3?' La maggiore aggressività deriva soprattutto dall\u2019esposizione crypto ('+fmtP(R.conc.cryptoPct)+' contro un limite di '+fmtP(R.conc.capCrypto)+').':'')+'</p>'
      +'<p class="hint" style="margin-top:10px">Score derivato da: allocazione × volatilità attesa per categoria (cash 0,5% · deposito 1,5% · bond 5% · stocks 17% · crypto/rischiosi 70%) + scala amplificativa e penalità di concentrazione. Risk Score personale: '+R.risk.score+'/100.</p>'
    +'</div><div>'
      +'<div class="kicker" style="margin-bottom:12px">CONCENTRATION RISK</div>'
      +'<ul class="tick">'+R.conc.statements.map(s=>'<li><span class="dot '+s.s+'"></span><span>'+s.t+'</span></li>').join('')+'</ul>'
      +(R.reb.reviews.length?'<div class="kicker" style="margin:20px 0 10px">DA VERIFICARE (REVIEW)</div><ul class="tick">'
        +R.reb.reviews.map(r=>'<li><i data-lucide="search" style="color:var(--warn)"></i><span><b>'+esc(r.h.name)+'</b><small>'+r.motivo+'</small></span></li>').join('')+'</ul>':'')
    +'</div></div>','Portfolio Risk Score, concentrazione per asset, categoria e area geografica.');

  /* 09 · stress */
  const maxLoss=Math.max.apply(null,R.stressCur.map(s=>s.lossPct).concat(R.stressTgt.map(s=>s.lossPct)).concat([0.3]));
  const bar=(v,c)=>'<div class="sbar"><div class="lbl"><span>'+c+'</span><span>'+fmtE(v.loss)+' ('+fmtP(v.lossPct)+') → residuo '+fmtE(v.remaining)+'</span></div><div class="tr"><div class="fl" style="width:'+clamp(v.lossPct/maxLoss*100,0,100).toFixed(1)+'%;background:'+(c==='Oggi'?'var(--bad)':'var(--c4)')+'"></div></div></div>';
  html+=secHTML('09','s-stress','Stress test',
    R.stressCur.map((s,i)=>{
      const t=R.stressTgt[i];
      return '<div class="scen"><div><h3>'+s.label+'</h3><div class="sd">'+s.sub+' · liquidità invariata = '+s.mesiLiq.toFixed(0)+' mesi di spese sempre coperti</div></div><div>'+bar(s,'Oggi')+bar(t,'Target')+'</div></div>';
    }).join('')
    +'<p class="hint" style="margin-top:16px">Esempio di lettura: nel «Crypto winter» il patrimonio diminuirebbe di circa <b>'+fmtE(R.stressCur[2].loss)+'</b> nella situazione attuale, contro <b>'+fmtE(R.stressTgt[2].loss)+'</b> nel target.'+(mode==='bro'?' <b>Con la modalità crypto bro questo scenario è la tua fonte di verità:</b> se una perdita di questo ordine non è sostenibile, riporta l\u2019esposizione crypto su Standard.':'')+' Gli shock sono applicati per categoria, non al totale: il rischio reale dipende dalla composizione.</p>',
    'Simulazione di drawdown per categoria: quanto peserebbe davvero ogni crisi.');

  /* 10 · proiezione */
  const P=R.proj;
  const cmpRow=(label,fa,ft)=>'<tr><td>'+label+'</td><td class="r">'+fa+'</td><td class="r"><b>'+ft+'</b></td></tr>';
  const m20=P.milestones.find(m=>m.y===20)||P.milestones[P.milestones.length-1];
  let narr;
  if(P.t.r>=P.a.r){
    narr='Al tasso atteso del target, il PAC di '+fmtE(P.pac)+'/mese porta il capitale a <b>'+fmtE(m20.tgt)+'</b> tra 20 anni — <b>'+fmtEs(m20.diff)+'</b> rispetto a mantenere l\u2019allocazione attuale ('+fmtE(m20.att)+'). In potere d\u2019acquisto di oggi (inflazione 2%): '+fmtE(m20.tgtReale)+'.';
  } else {
    narr='Nota: il target ha un rendimento atteso <b>inferiore</b> all\u2019attuale ('+fmtP(P.t.r)+' vs '+fmtP(P.a.r)+'). È il prezzo consapevole della riduzione del rischio richiesta dal tuo profilo: a 20 anni la differenza compone '+fmtEs(m20.diff)+', ma il drawdown profondo scende da −'+fmtP(P.a.dd)+' a −'+fmtP(P.t.dd)+' (perdita su oggi: '+fmtE(P.lossAtt)+' → '+fmtE(P.lossTgt)+') e il recupero dai massimi si accorcia.'+(P.a.dd>0.5?' Con un drawdown attuale superiore al −50%, valuta se riusciresti davvero a non vendere nel punto più basso: è l\u2019errore più costoso in assoluto.':'');
  }
  narr+=' Il drawdown profondo è la peggiore caduta tipica (storica) del mix: per attraversarla senza vendere serve la riserva di emergenza, che resta protetta a prescindere.';
  html+=secHTML('10','s-proj','Crescita attesa del capitale',
    '<div class="tblwrap"><table><tr><th>Metrica di rischio e rendimento</th><th class="r">Attuale</th><th class="r">Target</th></tr>'
    +cmpRow('Rendimento atteso medio annuo', fmtP(P.a.r), fmtP(P.t.r))
    +cmpRow('Volatilità attesa (stima prudente, senza correlazioni)', fmtP(P.a.vol), fmtP(P.t.vol))
    +cmpRow('Drawdown profondo atteso (proxy storica)', '−'+fmtP(P.a.dd), '−'+fmtP(P.t.dd))
    +cmpRow('Perdita in € se la crisi profonda colpisce oggi', '−'+fmtE(P.lossAtt), '−'+fmtE(P.lossTgt))
    +cmpRow('Anni stimati per rientrare dai massimi', P.recAtt==null?'—':'~'+P.recAtt.toFixed(0)+' anni', P.recTgt==null?'—':'~'+P.recTgt.toFixed(0)+' anni')
    +'</table></div>'
    +'<div class="kicker" style="margin:28px 0 6px">CRESCITA PROIETTATA A '+CONFIG.proiezione.anni+' ANNI — CON PAC DI '+fmtE(P.pac)+'/MESE</div>'
    +'<div class="legend" style="margin:0 0 6px"><span><span class="dot" style="background:var(--c4)"></span>Target</span><span><span class="dot" style="background:#57523F"></span>Attuale</span></div>'
    +projectionChart(P.yAtt,P.yTgt)
    +'<p class="hint" style="margin:10px 0 26px">Serie nominali a tassi costanti per categoria: stocks '+fmtP(CONFIG.rendimenti.etf)+' · bond '+fmtP(CONFIG.rendimenti.bond)+' · crypto '+fmtP(CONFIG.rendimenti.risk)+' · deposito '+fmtP(CONFIG.rendimenti.deposit)+' · liquidità '+fmtP(CONFIG.rendimenti.cash)+'. Stima deterministica, non una previsione.</p>'
    +'<div class="tblwrap"><table><tr><th>Orizzonte</th><th class="r">Attuale</th><th class="r">Target</th><th class="r">Differenza</th><th class="r">Target a potere d\u2019acquisto odierno</th></tr>'
    +P.milestones.map(m=>'<tr><td class="num">+'+m.y+' anni</td><td class="r">'+fmtE(m.att)+'</td><td class="r"><b>'+fmtE(m.tgt)+'</b></td><td class="r">'+fmtEs(m.diff)+'</td><td class="r" style="color:var(--ink2)">'+fmtE(m.tgtReale)+'</td></tr>').join('')
    +'</table></div>'
    +'<p style="margin-top:18px;font-size:15.5px"><i data-lucide="info"></i> '+narr+'</p>',
    'Rendimenti attesi dichiarati per categoria, inflazione e drawdown proxy: la crescita composta di «ora» rispetto al target, col relativo prezzo in rischio.');

  /* 11 · timeline */
  html+=secHTML('11','s-timeline','Money timeline',
    timelineSVG(R.fut.items)
    +'<p class="hint" style="margin-top:8px">Ogni capitale è associato al proprio orizzonte: ≤ 6 mesi → conto corrente · 6–36 → deposito · 36–60 → bond · oltre → investibile. Dimensione e colore dei nodi indicano importo e destinazione.</p>',
    'Gli obiettivi nel tempo e il capitale già «promesso» a ciascun orizzonte.');

  /* 12 · PAC intelligente: piano PAC vs redistribuzione immediata */
  const ps=R.pacSug, PP=R.pacPlan;
  const vA=(PP.verdict==='A'||PP.verdict==='già-nei-range'), vB=(PP.verdict==='B');
  const vTxt={
    'già-nei-range':'Il portafoglio è già nei range target su tutti i pilastri: nessun riequilibrio necessario. Il PAC passa in modalità manutenzione e il confronto qui sotto resta a titolo informativo.',
    'A':'Il PAC di '+fmtE(PP.pac)+'/mese colma il divario in ~'+fmtDur(PP.mesi)+' senza vendere nulla. Il costo stimato della redistribuzione ('+fmtE(PP.taxRangeLow)+'–'+fmtE(PP.taxRangeHigh)+') è abbastanza alto rispetto al divario: in questo caso il PAC è la strada migliore.',
    'B':'Il PAC richiederebbe ~'+fmtDur(PP.mesi)+', mentre la redistribuzione immediata ha un costo stimato tra '+fmtE(PP.taxRangeLow)+' e '+fmtE(PP.taxRangeHigh)+' ('+Math.round(PP.costoMinPct*100)+'–'+Math.round(PP.costoMaxPct*100)+'% delle vendite). Il costo resta entro la soglia di '+fmtE(PP.costoSogliaEur)+' oppure il PAC supera i '+PP.soglia+' anni: conviene il Piano B, eventualmente combinato con il PAC.',
    'nessuno':'La capacità di risparmio stimata è nulla o negativa: l\u2019unico modo per colmare il divario è la redistribuzione immediata (Piano B).'
  }[PP.verdict];
  let pacHTML='<div class="stat-row"><span class="sk">Capacità di risparmio stimata (reddito − spese)</span><span class="sv">'+fmtE(Math.max(0,ps.capacity))+'/mese</span></div>'
    +'<div class="stat-row"><span class="sk">PAC mensile calcolato dal motore (90% della capacità)</span><span class="sv">'+fmtE(PP.pac)+'/mese</span></div>'
    +'<div class="stat-row"><span class="sk">Divario da colmare verso il target</span><span class="sv">'+fmtE(PP.gapTot)+'</span></div>'
    +'<div class="duo" style="gap:16px;margin:22px 0 18px">'
      +'<div class="planbox'+(vA?' win':'')+'">'
        +'<div class="pt"><span>Piano A</span>'+(vA?'<span class="chip green">Consigliato</span>':'')+'</div>'
        +'<h3>Solo versamenti (PAC)</h3>'
        +'<div class="stat-row"><span class="sk">Tempo per rientrare nei target</span><span class="sv">'+(PP.mesi==null?'non raggiungibile':fmtDur(PP.mesi))+'</span></div>'
        +'<div class="stat-row"><span class="sk">Vendite necessarie</span><span class="sv">0</span></div>'
        +'<div class="stat-row"><span class="sk">Costo fiscale</span><span class="sv">€0</span></div>'
        +'<p class="hint" style="margin-top:10px">Conviene fiscalmente: versare non realizza plusvalenze, quindi nessuna imposta. Il prezzo è il tempo.</p>'
      +'</div>'
      +'<div class="planbox'+(vB?' win':'')+'">'
        +'<div class="pt"><span>Piano B</span>'+(vB?'<span class="chip green">Consigliato</span>':(PP.verdict==='nessuno'?'<span class="chip amber">Unica opzione</span>':''))+'</div>'
        +'<h3>Redistribuzione immediata</h3>'
        +'<div class="stat-row"><span class="sk">Tempo per rientrare nei target</span><span class="sv">immediato (~1–2 settimane)</span></div>'
        +'<div class="stat-row"><span class="sk">Vendite necessarie</span><span class="sv">'+PP.venditeN+' per '+fmtE(PP.venditeEur)+'</span></div>'
        +'<div class="stat-row"><span class="sk">Costo stimato (tasse + commissioni)</span><span class="sv">'+fmtE(PP.taxRangeLow)+'–'+fmtE(PP.taxRangeHigh)+'</span></div>'
        +'<p class="hint" style="margin-top:10px">Stima prudenziale: circa '+Math.round(PP.costoMinPct*100)+'–'+Math.round(PP.costoMaxPct*100)+'% del capitale venduto, commissioni incluse. Se il costo di acquisto è noto, il valore effettivo può essere più preciso; se non è noto, il range evita di mostrare un falso €0.</p>'
      +'</div>'
    +'</div>'
    +'<div class="azione"><i data-lucide="scale"></i><span><b>Verdetto del motore.</b> '+vTxt+'</span></div>'
    +(R.pac
      ?'<div class="kicker" style="margin:26px 0 8px">RIPARTIZIONE MENSILE DEL PAC — TARGET-AWARE</div>'
        +pacSplitRows(R.pac)
        +'<div class="subline">Totale allocato: <b>'+fmtE(R.pac.totale)+'</b> su '+fmtE(R.pac.mensile)+' · modalità: <b>'+R.pac.modalita+'</b></div>'
      :'<p class="hint" style="margin-top:18px">PAC pari a zero: nessuna ripartizione mensile da mostrare.</p>')
    +'<p class="hint" style="margin-top:18px"><b>Nota decisionale.</b> Il motore confronta due compromessi: considera alto un costo oltre '+fmtE(PP.costoSogliaEur)+' e lungo un PAC oltre '+PP.soglia+' anni. La stima usa un range prudenziale del '+Math.round(PP.costoMinPct*100)+'–'+Math.round(PP.costoMaxPct*100)+'% delle vendite; se nessuna vendita è necessaria, il Piano B resta naturalmente favorito.</p>';
  html+=secHTML('12','s-pac','PAC intelligente',pacHTML,'Quanto versare ogni mese (calcolato come capacità di risparmio), in quanto tempo colmi il divario verso il target, e quando conviene invece la redistribuzione immediata.');

  /* 13 · extra cash (interattiva, non stampata) */
  html+=secHTML('13','s-extra','E se ricevessi capitali extra?',
    '<div class="tool"><h3>Simulatore extra cash</h3><div class="td">Ad esempio una tredicesima straordinaria, un\u2019eredità, un rimborso. La distribuzione privilegia la correzione degli squilibri <b>senza vendere nulla</b>. (Non inclusa nella stampa del report.)</div>'
    +'<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end">'
      +'<div class="field" style="flex:1;min-width:200px"><label>Capitale extra ricevuto (€)</label><input type="number" id="extra-amt" value="10000" min="0"></div>'
      +'<button class="btn" id="extra-btn">Simula distribuzione</button>'
    +'</div><div class="toolout" id="extra-out"><span class="hint">Inserisci un importo e simula.</span></div></div>');

  /* 14 · simulatore + breakpoint (interattivo, non stampato) */
  html+=secHTML('14','s-sim','Simulatore «e se…»',
    '<div class="tool"><h3>Quando cambia il portafoglio?</h3><div class="td">Muovi i cursori: il target si ricalcola in tempo reale con lo stesso motore dell\u2019analisi. Il portafoglio attuale resta quello inserito — cambia solo la destinazione. L\u2019esposizione crypto resta quella scelta nello step 1. (Non incluso nella stampa del report.)</div>'
    +'<div class="fgrid">'
      +'<div class="field c3"><label>Patrimonio finanziario <output id="o-sfin"></output></label><input type="range" id="sim-fin" min="5000" max="400000" step="5000" value="'+Math.round(fin)+'"></div>'
      +'<div class="field c3"><label>Spese essenziali <output id="o-sess"></output></label><input type="range" id="sim-ess" min="300" max="5000" step="50" value="'+input.spese.essenziali+'"></div>'
      +'<div class="field c3"><label>Profilo di rischio <output id="o-savv"></output></label><input type="range" id="sim-avv" min="1" max="10" value="'+(11-input.avversione)+'"></div>'
      +'<div class="field c3"><label>Età <output id="o-seta"></output></label><input type="range" id="sim-eta" min="18" max="80" value="'+input.eta+'"></div>'
    +'</div><div class="toolout" id="sim-out"></div></div>'
    +'<div style="margin-top:34px"><div class="kicker" style="margin-bottom:14px">BREAKPOINT ANALYSIS — cosa sposta le raccomandazioni</div>'
    +'<ul class="tick">'+R.bps.map(b=>'<li><i data-lucide="activity" style="color:var(--c3)"></i><span>'+b+'</span></li>').join('')+'</ul></div>',
    'Sensibilità del modello: ogni raccomandazione è riconducibile a un input modificabile — incluso il flag crypto e le soglie di età.');

  /* 15 · metodo */
  const rendInfoStr=PILLARS.map(p=>p.nome.split(' (')[0]+' r='+CONFIG.rendInfo[p.k]).join(' · ');
  html+=secHTML('15','s-metodo','Come abbiamo calcolato il portafoglio',
    '<div class="trace">'+R.trace.map(g=>'<div class="tg"><div class="tgh">'+g.g+'</div>'
      +g.items.map(i=>'<div class="ti"><span class="tf">'+i.f+'</span><span class="tv">'+i.v+'</span></div>').join('')+'</div>').join('')+'</div>'
    +'<div class="kicker" style="margin:26px 0 6px">TEST AUTOMATICI DEGLI INVARIANTI</div>'
    +'<div class="inv">'+R.invariants.map(t=>'<div class="'+(t.ok?'ok':'ko')+'"><i data-lucide="'+(t.ok?'check':'x')+'"></i>'+t.nome+' — '+t.detail+'</div>').join('')+'</div>'
    +'<div class="kicker" style="margin:26px 0 8px">ASSUNZIONI DICHIARATE</div>'
    +'<ul class="tick">'
      +'<li><i data-lucide="info"></i><span>Il PAC non è un input: è il <b>90% della capacità di risparmio</b> (reddito − spese), arrotondato a '+fmtE(CONFIG.pac.arrotondaA)+'. Il tempo di rientro con il solo PAC è stimato come ⌈divario ÷ PAC⌉ mesi; se supera i '+CONFIG.pac.sogliaAnni+' anni il motore raccomanda la redistribuzione immediata (soglia in CONFIG.pac.sogliaAnni).</span></li>'
      +'<li><i data-lucide="info"></i><span>Range di rendimento atteso dichiarati per pilastro: '+rendInfoStr+'. I valori puntuali usati nei calcoli (deposito '+fmtP(CONFIG.rendimenti.deposit)+', bond '+fmtP(CONFIG.rendimenti.bond)+', stocks '+fmtP(CONFIG.rendimenti.etf)+', crypto '+fmtP(CONFIG.rendimenti.risk)+', liquidità '+fmtP(CONFIG.rendimenti.cash)+') ricadono dentro i rispettivi range; inflazione '+fmtP(CONFIG.proiezione.inflazione)+'. Sono ipotesi costanti nel tempo, non previsioni: la proiezione è deterministica e non modella la sequenza dei mercati né garantisce alcun risultato.</span></li>'
      +'<li><i data-lucide="info"></i><span>Range adeguato per pilastro = target ±'+fmtP(CONFIG.bande.tolleranza)+' del patrimonio (le stesse bande del motore di riequilibrio); oltre ±'+fmtP(CONFIG.bande.moderata)+' lo scostamento è classificato come forte.</span></li>'
      +'<li><i data-lucide="info"></i><span>Drawdown proxy per categoria (crolli storici tipici): bond −'+fmtP(CONFIG.drawdown.bond)+', stocks −'+fmtP(CONFIG.drawdown.etf)+', crypto/rischiosi −'+fmtP(CONFIG.drawdown.risk)+'. La volatilità è sommata per categoria senza correlazioni: è una stima prudente (sovrastima).</span></li>'
      +'<li><i data-lucide="info"></i><span>Esposizione crypto scelta: <b>'+(CONFIG.cryptoModeLabel[mode]||mode)+'</b>. '+(mode==='no'?'Il pilastro rischiosi ha target zero.':(mode==='bro'?'Tetto crypto '+fmtP(CONFIG.crypto.broCap)+' dell\u2019investibile, quota crescita +'+Math.round(CONFIG.crypto.broBoost*100)+'pp, limiti di età e profilo ignorati su richiesta esplicita dell\u2019utente.':'Tetto derivato da formula, profilo, età e massimo del '+fmtP(CONFIG.crypto.massimo)+'.'))+'</span></li>'
      +'<li><i data-lucide="info"></i><span>Boost giovani: sotto i '+CONFIG.giovane.etaLimite+' anni la quota crescita riceve +'+Math.round(CONFIG.giovane.boostPerAnno*1000)/10+'pp per ogni anno mancante — a 18 anni il bond strategico tende a zero (solo stocks e crypto). Prudenza matura: età ≥ '+CONFIG.prudenza.etaVecchia+' e profilo ≥ '+CONFIG.prudenza.profiloPrudente+' → profilo difensivo '+Math.round(CONFIG.prudenza.maxCrescita*100)+'-'+Math.round((1-CONFIG.prudenza.maxCrescita)*100)+' con crypto 0, salvo crypto bro.</span></li>'
      +'<li><i data-lucide="info"></i><span>Tassazione plusvalenze al '+fmtP(CONFIG.tasse.plusvalenze)+' (aliquote italiane); i valori inseriti si intendono già espressi in euro. Commissione stimata '+fmtP(CONFIG.costi.commissionePct)+' per operazione (minimo '+fmtE(CONFIG.costi.commissioneMin)+'). Senza costo di acquisto, l\u2019impatto fiscale delle vendite non è stimabile: il sistema lo dichiara invece di inventarlo.</span></li>'
    +'</ul>','Ogni numero è riconducibile a un input, una formula o una soglia. Nessuna black box.');

  $('#res-body').innerHTML=html;
  const navLinks=[['01 · Patrimonio','s-pat'],['02 · Sicurezza','s-sic'],['03 · Pilastri','s-pdet'],['04 · Target','s-target'],['06 · Piano','s-piano'],['08 · Rischio','s-rischio'],['09 · Stress','s-stress'],['10 · Crescita','s-proj'],['12 · PAC','s-pac'],['15 · Metodo','s-metodo']];
  $('#resnav').hidden=false;
  $('#resnav-links').innerHTML=navLinks.map(l=>'<a href="#'+l[1]+'">'+l[0]+'</a>').join('');
  $('#foot').hidden=false;
  refreshIcons();
  wireSim(R); wireExtra(R);
  wireScrollSpy(navLinks.map(l=>l[1]));
}

/* ============================================================
   Simulatori interattivi
   ============================================================ */
function wireSim(R){
  const upd=()=>{
    const pFin=parseNum($('#sim-fin').value), pEss=parseNum($('#sim-ess').value), pAvv=+$('#sim-avv').value, pEta=+$('#sim-eta').value;
    $('#o-sfin').textContent=fmtE(pFin); $('#o-sess').textContent=fmtE(pEss)+'/m';
    $('#o-savv').textContent=AVV_L(pAvv); $('#o-seta').textContent=pEta+' anni';
    const c=deepClone(R.input);
    const factor=pFin/Math.max(1,R.fin);
    c.holdings=c.holdings.map(h=>Object.assign({},h,{value:h.value*factor}));
    c.spese.essenziali=pEss; c.avversione=11-pAvv; c.eta=pEta;
    const core=runCore(c);
    const pr=calculateProiezione(c, pillarTotals(c.holdings), core.tgt);
    const m20=pr.milestones.find(m=>m.y===20);
    $('#sim-out').innerHTML='<div style="margin-bottom:14px">'+miniStacked(core.tgt.pct,24)+'</div>'
      +'<div class="legend" style="margin-bottom:16px">'+PILLARS.map(p=>'<span><span class="dot" style="background:'+p.c+'"></span>'+p.breve+' '+fmtP(core.tgt.pct[p.k])+' · '+fmtE(core.tgt.values[p.k])+'</span>').join('')+'</div>'
      +'<div class="stat-row"><span class="sk">Fondo emergenza</span><span class="sv">'+fmtE(core.ef.totale)+' ('+core.ef.mesi+' mesi)</span></div>'
      +'<div class="stat-row"><span class="sk">Capitale protetto / investibile · quota crescita</span><span class="sv">'+fmtE(Math.min(core.fin,core.fut.protetto))+' / '+fmtE(core.tgt.investable)+' · crescita '+fmtP(core.tgt.growthShare)+'</span></div>'
      +'<div class="stat-row"><span class="sk">Rendimento atteso · drawdown profondo</span><span class="sv">'+fmtP(pr.t.r)+' · −'+fmtP(pr.t.dd)+'</span></div>'
      +'<div class="stat-row"><span class="sk">Target a 20 anni (con PAC)</span><span class="sv">'+fmtE(m20.tgt)+' ('+fmtE(m20.tgtReale)+' reali)</span></div>'
      +'<div class="stat-row"><span class="sk">Risk Score · limite rischio</span><span class="sv">'+core.risk.score+'/100 · '+fmtP(core.tgt.caps.finale)+(core.tgt.caps.finale>0?' (vincolo: '+core.tgt.caps.binding+')':'')+'</span></div>';
  };
  ['sim-fin','sim-ess','sim-avv','sim-eta'].forEach(id=>$('#'+id).addEventListener('input',upd));
  upd();
}
function wireExtra(R){
  $('#extra-btn').addEventListener('click',()=>{
    const amt=parseNum($('#extra-amt').value);
    const out=$('#extra-out');
    if(!(amt>0)){ out.innerHTML='<span class="hint" style="color:var(--bad)">Inserisci un importo valido.</span>'; return; }
    const reb=distributeCash(amt, R.input.holdings, R.tgt);
    const ext=reb.moves.filter(m=>m.from.tipo==='esterno');
    if(ext.length){
      out.innerHTML='<div class="kicker" style="margin-bottom:10px">DISTRIBUZIONE OTTIMALE DI '+fmtE(amt)+' — NESSUNA VENDITA</div>'
        +ext.map(m=>'<div class="alloc-line"><span>'+fmtE(m.amount)+' → <b>'+Pk[m.to].nome+'</b></span><b class="num">'+fmtP(m.amount/amt)+'</b></div>').join('')
        +(reb.nota?'<p class="hint" style="margin-top:12px">'+reb.nota+'</p>':'');
    } else {
      const gaps=PILLARS.map(p=>({n:p.nome,g:R.tgt.values[p.k]-reb.proj[p.k]})).filter(x=>x.g>CONFIG.bande.ticketMinimo).sort((a,b)=>b.g-a.g);
      out.innerHTML='<span class="dot ok"></span>La liquidità già presente copre gli squilibri: <b>'+fmtE(amt)+'</b> possono restare in deposito senza danni.'
        +(gaps.length?' Il gap maggiore residuo è su <b>'+esc(gaps[0].n)+'</b> ('+fmtE(gaps[0].g)+'), se vuoi anticipare i tempi.':'')
        +(reb.nota?'<p class="hint" style="margin-top:12px">'+reb.nota+'</p>':'');
    }
  });
}

/* ============================================================
   Cablaggio eventi
   ============================================================ */
 $('#btn-start').addEventListener('click',()=>{ $('#intro').hidden=true; $('#wizard').hidden=false; window.scrollTo(0,0); refreshIcons(); });
 $('#btn-reset').addEventListener('click',()=>{
  killScrollSpy();
  $('#results').hidden=true; $('#resnav').hidden=true; $('#foot').hidden=true; $('#btn-reset').hidden=true;
  $('#wizard').hidden=false; window.scrollTo(0,0);
});
 $('#btn-print').addEventListener('click',()=>window.print());
 $('#btn-prev').addEventListener('click',()=>goStep(step-1));
 $('#btn-next').addEventListener('click',()=>{
  try{
    if(step===5 && sum(readPillarHoldings().map(h=>h.value))<=0){ showWerr('Inserisci almeno un importo in uno dei cinque pilastri (oppure applica uno degli scenari d\u2019esempio).'); return; }
    $('#werr').classList.remove('show'); goStep(step+1);
  }catch(err){ showWerr('Errore: '+err.message); }
});
 $('#btn-analyze').addEventListener('click',()=>{
  try{
    const input=collectInput();
    if(!input.holdings.length) throw new Error('Il portafoglio è vuoto: inserisci almeno un importo in uno dei cinque pilastri (step 5) o applica uno degli scenari d\u2019esempio.');
    S.input=input; S.R=analyze(input);
    $('#wizard').hidden=true; $('#results').hidden=false; $('#btn-reset').hidden=false;
    renderResults(S.R); window.scrollTo(0,0);
  }catch(err){
    console.error(err);
    showWerr('Errore durante il calcolo: '+err.message+' — riprova o ricarica l\u2019esempio.');
  }
});
/* barra profilo: drag e click sull'intera area (input range sovrapposto, delegato) */
 $('#bp-zones').addEventListener('input',e=>{ if(e.target.id==='f-avv') updateLive(); });
/* selettore crypto: click sulle 3 card */
 $('#cm-sel').addEventListener('click',e=>{
  const b=e.target.closest('.cmopt'); if(!b) return;
  $('#f-crypto').value=+b.dataset.cm;
  updateLive();
});
 $('#btn-goal-add').addEventListener('click',()=>{ $('#goal-rows').appendChild(rowGoal()); refreshIcons(); });
 $('#btn-extra-add').addEventListener('click',()=>{ $('#extra-rows').appendChild(rowExtra()); refreshIcons(); updateRealeLive(); });
 $('#btn-example').addEventListener('click',()=>loadExample());
 $('#goal-rows').addEventListener('click',e=>{ const b=e.target.closest('.rdel'); if(b){ b.closest('.row').remove(); } });
 $('#extra-rows').addEventListener('click',e=>{ const b=e.target.closest('.rdel'); if(b){ b.closest('.row').remove(); updateRealeLive(); } });
 $('#extra-rows').addEventListener('input',()=>updateRealeLive());
['rw-casa','rw-auto'].forEach(id=>$('#'+id).addEventListener('change',updateRealeLive));
['f-homev','f-homem','f-carv','f-carl'].forEach(id=>$('#'+id).addEventListener('input',updateRealeLive));
 $('#pillars').addEventListener('click',e=>{
  const card=e.target.closest('.pillar-card'); if(!card) return;
  if(e.target.closest('.pc-toggle')){ const w=card.querySelector('.pd-wrap'); w.hidden=!w.hidden; }
  if(e.target.closest('.pd-add')){ card.querySelector('.pd-rows').appendChild(rowDetail()); refreshIcons(); updPdSum(card); }
  const del=e.target.closest('.rdel'); if(del){ del.closest('.row').remove(); updPdSum(card); }
});
 $('#pillars').addEventListener('input',e=>{
  const card=e.target.closest('.pillar-card'); if(!card) return;
  if(e.target.classList.contains('p-amt')) updatePillarLive();
  if(e.target.classList.contains('d-val')) updPdSum(card);
});
['f-stab','f-inc','f-inc2','f-ess','f-disc','f-eta'].forEach(id=>$('#'+id).addEventListener('input',updateLive));

/* ============================================================
   Self-test: 10 scenari all'avvio, più la proiezione d'esempio.
   ============================================================ */
(function selfTest(){
  try{
    const base=buildTestInput();
    const cases={
      'esempio': base,
      'molto prudente': variantInput(base, c=>{c.avversione=10; c.reddito.stabilita=3;}),
      'aggressivo (rischio max)': variantInput(base, c=>{c.avversione=1; c.reddito.stabilita=9; c.eta=28;}),
      '18enne (boost giovani)': variantInput(base, c=>{c.eta=18; c.avversione=4;}),
      '68enne prudente (70-30)': variantInput(base, c=>{c.eta=68; c.avversione=8;}),
      'no crypto (flag off)': variantInput(base, c=>{c.cryptoMode='no';}),
      'crypto bro (flag max)': variantInput(base, c=>{c.cryptoMode='bro';}),
      'crypto bro prudente (coerenza)': variantInput(base, c=>{c.cryptoMode='bro'; c.avversione=10; c.reddito.stabilita=3;}),
      'patrimonio piccolo (sotto-copertura)': variantInput(base, c=>{c.holdings=c.holdings.map(h=>Object.assign({},h,{value:Math.round(h.value/15)})); c.obiettivi.push({nome:'Fondo garanzia',importo:5000,mesi:24});}),
      'solo liquidità': variantInput(base, c=>{c.holdings=c.holdings.filter(h=>h.category==='cash').map(h=>Object.assign({},h,{value:50000}));}),
    };
    console.group('%cPortfolio Engine — test automatici su 10 scenari','font-weight:bold');
    let fails=0;
    Object.keys(cases).forEach(name=>{
      let R;
      try{ R=analyze(cases[name]); }
      catch(e){ fails++; console.log('✗ ['+name+'] errore motore: '+e.message); return; }
      const bad=R.invariants.filter(t=>!t.ok);
      if(bad.length){ fails++; bad.forEach(t=>console.log('✗ ['+name+'] '+t.nome+' → '+t.detail)); }
      else console.log('✓ '+name+' — invarianti ok (risk '+R.risk.score+', PAC '+fmtE(R.pacPlan.pac)+'/m, rientro '+fmtDur(R.pacPlan.mesi)+', verdetto '+R.pacPlan.verdict+')');
    });
    try{
      const R0=analyze(cases['esempio']);
      const m=R0.proj.milestones.find(x=>x.y===20);
      console.log('→ Proiezione 20 anni (esempio): attuale '+fmtE(m.att)+' · target '+fmtE(m.tgt)+' ('+fmtEs(m.diff)+' nominali · drawdown attuale −'+fmtP(R0.proj.a.dd)+' vs target −'+fmtP(R0.proj.t.dd)+')');
    }catch(e){}
    console.log(fails? '⚠ '+fails+' scenari FALLITI — controlla i dettagli sopra.' : 'Motore verificato: tutti gli scenari soddisfano gli invarianti.');
    console.groupEnd();
  }catch(e){ console.warn('Self-test non eseguito:', e); }
})();

/* Init */
loadExample();
renderRail(); goStep(1); refreshIcons();
