'use strict';

/* UI copy kept separate from the calculation engine so the language can change
   without changing any inputs, formulas, or application state. */
const TRANSLATIONS = {
  it: {
    'meta.title': 'Personal Portfolio Optimizer — Allocation & Rebalancing Engine',
    brand: 'Personal <b>Portfolio</b> Optimizer',
    'language.toggle': 'EN',
    'topbar.privacy': 'Engine locale · nessun dato inviato',
    'topbar.reset': 'Nuova analisi',
    'hero.kicker': 'AI Financial Allocation & Rebalancing Engine',
    'hero.title': 'Dove sei.<br>Dove arrivare.<br><em>Cosa fare domani.</em>',
    'hero.subtitle': 'Analisi patrimoniale · allocazione target dinamica · riequilibrio a minimo intervento',
    'hero.lede': 'Lo strumento ricostruisce la tua intera situazione finanziaria — reddito, spese, obiettivi, debiti, portafoglio attuale — e calcola un\'allocazione coerente con il tuo profilo reale. Poi fa la cosa più difficile: ti dice <b>cosa non toccare</b>.',
    'hero.quote': '«Non devi avere un portafoglio perfetto. Devi avere un portafoglio coerente e facilmente mantenibile.»',
    'hero.start': 'Avvia l\'analisi',
    'hero.foot': '9 scenari precompilabili · proiezione rendimenti e drawdown · report stampabile · calcolo in locale',
    'pipeline.title': 'La catena di calcolo',
    'wizard.note': 'I campi sono precompilati con un esempio realistico e completamente modificabile. Nessun valore lascia il browser.',
    'steps.profile.step': 'Step 1 / 6',
    'steps.profile.title': 'Profilo e rischio',
    'steps.profile.desc': 'L\'età descrive la <b>capacità</b> di recuperare da un drawdown; il profilo descrive dove vuoi stare tra <b>stabilità</b> e <b>rendimento</b>. Sono variabili indipendenti: una persona giovane può essere prudente, una persona matura aggressiva.',
    'steps.income.step': 'Step 2 / 6',
    'steps.income.title': 'Reddito',
    'steps.income.desc': 'La <b>stabilità</b> del reddito dimensiona il fondo emergenza: chi ha entrate variabili necessita una riserva maggiore, a parità di profilo di rischio.',
    'steps.expenses.step': 'Step 3 / 6',
    'steps.expenses.title': 'Spese',
    'steps.expenses.desc': 'Il fondo emergenza è calcolato sulle sole <b>spese essenziali</b>. La differenza tra reddito e spese diventerà il tuo <b>PAC</b>, calcolato automaticamente nell\'analisi finale.',
    'steps.goals.step': 'Step 4 / 6',
    'steps.goals.title': 'Obiettivi futuri',
    'steps.goals.desc': 'Ogni spesa programmata viene associata all\'orizzonte corretto: entro 6 mesi → conto corrente, 6–36 mesi → conto deposito, 36–60 mesi → bond, oltre → capitale investibile.',
    'steps.goals.pacHint': 'Il <b>PAC mensile non va inserito</b>: il motore lo calcola da solo come capacità di risparmio (reddito − spese) e ti mostra, nell\'analisi finale, quanto versare ogni mese per colmare il divario verso il target — e in quanto tempo.',
    'steps.assets.step': 'Step 5 / 6',
    'steps.assets.title': 'Il tuo patrimonio',
    'steps.assets.desc': 'Tre blocchi: gli <b>scenari d\'esempio</b> per partire in fretta, ciò che possiedi <b>fuori dagli investimenti</b>, e il tuo <b>portafoglio</b> nei cinque pilastri.',
    'steps.summary.step': 'Step 6 / 6',
    'steps.summary.title': 'Riepilogo',
    'steps.summary.desc': 'Verifica i dati prima di eseguire il motore di calcolo.',
    'profile.stability': 'Stabilità',
    'profile.growth': 'Rendimento',
    'profile.maxSafety': 'massima sicurezza',
    'profile.drag': 'trascina o clicca',
    'profile.maxGrowth': 'massima crescita',
    'profile.scale': '/10',
    'crypto.no.title': 'No crypto',
    'crypto.no.desc': 'Pilastro azzerato: crescita tutta in ETF, uscita graduale dalle crypto che possiedi.',
    'crypto.standard.title': 'Standard',
    'crypto.standard.desc': 'Il modello decide in base a profilo ed età. Con età ≥ 60 e profilo ≥ 7 le crypto vengono comunque azzerate.',
    'crypto.bro.title': 'Crypto bro',
    'crypto.bro.desc': 'Crypto enfatizzate: tetto ~50% dell’investibile, limiti di età e profilo ignorati. Vedi lo stress test.',
    'fields.age': 'Età',
    'fields.cryptoExposure': 'Esposizione crypto',
    'fields.netIncome': 'Reddito netto mensile (€)',
    'fields.otherIncome': 'Altre entrate mensili (€)',
    'fields.incomeStability': 'Stabilità del reddito',
    'fields.annualIncome': 'Reddito netto annuo stimato:',
    'fields.essentialExpenses': 'Spese essenziali mensili (€)',
    'fields.discretionaryExpenses': 'Spese discrezionali mensili (€)',
    'fields.totalExpenses': 'Totale spese mensili:',
    'fields.estimatedValue': 'Valore stimato (€)',
    'fields.remainingMortgage': 'Mutuo residuo (€)',
    'fields.remainingFinancing': 'Finanziamento residuo (€)',
    'table.name': 'Nome',
    'table.amount': 'Importo (€)',
    'table.months': 'Mesi da oggi',
    'table.type': 'Tipo',
    'table.value': 'Valore (€)',
    'buttons.addGoal': 'Aggiungi obiettivo',
    'buttons.addAsset': 'Aggiungi bene o debito',
    'buttons.reloadExample': 'Ricarica esempio',
    'buttons.back': 'Indietro',
    'buttons.analyze': 'Esegui l\'analisi',
    'buttons.next': 'Avanti',
    'buttons.print': 'Stampa / PDF',
    'assets.presets.kicker': 'SCENARI D\'ESEMPIO — CLICCA PER PRECOMPILARE',
    'assets.presets.desc': 'Nove portafogli tipo, dagli estremi prudenziali agli estremi speculativi. Applicare uno scenario sovrascrive solo i <b>cinque pilastri</b>, lasciando intatti profilo, età, crypto, reddito, spese e obiettivi.',
    'assets.other.kicker': 'A · Cosa possiedi oltre agli investimenti',
    'assets.other.kickerTitle': 'ALTRI BENI E DEBITI',
    'assets.other.desc': 'Non è capitale investibile: serve a calcolare il patrimonio netto e valutare la concentrazione. Disattiva ciò che non possiedi.',
    'assets.other.detail': '— terreno, prestiti, carte, qualunque cosa',
    'assets.home.title': 'Casa',
    'assets.home.desc': 'Abitazione di proprietà — inserisci valore e mutuo residuo',
    'assets.home.hint': 'Se non hai un mutuo, lascia 0. Se la casa è in affitto o non ti appartiene, disattiva l\'interruttore.',
    'assets.car.title': 'Auto',
    'assets.car.desc': 'Veicoli di proprietà — inserisci valore e finanziamento residuo',
    'assets.car.hint': 'Se l\'auto è a noleggio o non hai finanziamenti in corso, lascia 0 o disattiva.',
    'assets.portfolio.kicker': 'B · Il tuo portafoglio — i 5 pilastri',
    'assets.portfolio.desc': 'Per ogni pilastro inserisci <b>quanto possiedi in totale</b>. Non sai classificare qualcosa? Leggi il sottotitolo: se è liquidità va nel P1, se è denaro fermo nel P2, se sono titoli nel P3, se sono fondi azionari nel P4, se è speculativo nel P5. Vuoi una stima fiscale e di concentrazione più precisa? Apri «Dettaglia le posizioni».',
    'assets.portfolio.total': 'Patrimonio finanziario totale:',
    'nav.next': 'Voci successive',
    'footer.quote': '«Non devi avere un portafoglio perfetto. Devi avere un portafoglio coerente e facilmente mantenibile.»',
    'footer.disclaimer': '<b>Disclaimer.</b> Questo strumento fornisce una simulazione matematica e informativa basata sui dati inseriti dall\'utente. Non costituisce consulenza finanziaria personalizzata, fiscale o legale. Le decisioni di investimento devono tenere conto della situazione individuale e degli strumenti effettivamente disponibili.'
  },
  en: {
    'meta.title': 'Personal Portfolio Optimizer — Allocation & Rebalancing Engine',
    brand: 'Personal <b>Portfolio</b> Optimizer',
    'language.toggle': 'IT',
    'topbar.privacy': 'Local engine · no data sent',
    'topbar.reset': 'New analysis',
    'hero.kicker': 'AI Financial Allocation & Rebalancing Engine',
    'hero.title': 'Where you are.<br>Where to go.<br><em>What to do tomorrow.</em>',
    'hero.subtitle': 'Financial overview · dynamic target allocation · minimum-intervention rebalancing',
    'hero.lede': 'The tool rebuilds your complete financial picture — income, expenses, goals, debts, current portfolio — and calculates an allocation consistent with your real profile. Then it does the hardest thing: it tells you <b>what not to touch</b>.',
    'hero.quote': '“You do not need a perfect portfolio. You need a consistent portfolio that is easy to maintain.”',
    'hero.start': 'Start the analysis',
    'hero.foot': '9 ready-made scenarios · return and drawdown projection · printable report · runs locally',
    'pipeline.title': 'The calculation chain',
    'wizard.note': 'Fields are pre-filled with a realistic, fully editable example. No value leaves your browser.',
    'steps.profile.step': 'Step 1 / 6',
    'steps.profile.title': 'Profile and risk',
    'steps.profile.desc': 'Age describes your <b>capacity</b> to recover from a drawdown; your profile describes where you want to sit between <b>stability</b> and <b>return</b>. They are independent variables: a young person can be cautious, and a mature person aggressive.',
    'steps.income.step': 'Step 2 / 6',
    'steps.income.title': 'Income',
    'steps.income.desc': 'Income <b>stability</b> determines the emergency fund: variable income requires a larger reserve for the same risk profile.',
    'steps.expenses.step': 'Step 3 / 6',
    'steps.expenses.title': 'Expenses',
    'steps.expenses.desc': 'The emergency fund is calculated only from <b>essential expenses</b>. The difference between income and expenses becomes your <b>monthly investment plan</b>, calculated automatically in the final analysis.',
    'steps.goals.step': 'Step 4 / 6',
    'steps.goals.title': 'Future goals',
    'steps.goals.desc': 'Each planned expense is assigned to the right horizon: within 6 months → current account, 6–36 months → savings account, 36–60 months → bonds, beyond → investable capital.',
    'steps.goals.pacHint': 'Do <b>not enter the monthly investment plan</b>: the engine calculates it from your saving capacity (income − expenses) and shows how much to contribute each month to close the gap to the target — and how long it will take.',
    'steps.assets.step': 'Step 5 / 6',
    'steps.assets.title': 'Your assets',
    'steps.assets.desc': 'Three blocks: <b>example scenarios</b> to get started quickly, what you own <b>outside investments</b>, and your <b>portfolio</b> across five pillars.',
    'steps.summary.step': 'Step 6 / 6',
    'steps.summary.title': 'Summary',
    'steps.summary.desc': 'Check the data before running the calculation engine.',
    'profile.stability': 'Stability',
    'profile.growth': 'Return',
    'profile.maxSafety': 'maximum safety',
    'profile.drag': 'drag or click',
    'profile.maxGrowth': 'maximum growth',
    'profile.scale': '/10',
    'crypto.no.title': 'No crypto',
    'crypto.no.desc': 'Pillar set to zero: all growth goes to ETFs, with a gradual exit from crypto you own.',
    'crypto.standard.title': 'Standard',
    'crypto.standard.desc': 'The model decides based on profile and age. At age ≥ 60 and profile ≥ 7, crypto is zeroed out anyway.',
    'crypto.bro.title': 'Crypto bro',
    'crypto.bro.desc': 'Crypto emphasized: cap of ~50% of investable capital, ignoring age and profile limits. See the stress test.',
    'fields.age': 'Age',
    'fields.cryptoExposure': 'Crypto exposure',
    'fields.netIncome': 'Net monthly income (€)',
    'fields.otherIncome': 'Other monthly income (€)',
    'fields.incomeStability': 'Income stability',
    'fields.annualIncome': 'Estimated annual net income:',
    'fields.essentialExpenses': 'Essential monthly expenses (€)',
    'fields.discretionaryExpenses': 'Discretionary monthly expenses (€)',
    'fields.totalExpenses': 'Total monthly expenses:',
    'fields.estimatedValue': 'Estimated value (€)',
    'fields.remainingMortgage': 'Remaining mortgage (€)',
    'fields.remainingFinancing': 'Remaining financing (€)',
    'table.name': 'Name',
    'table.amount': 'Amount (€)',
    'table.months': 'Months from today',
    'table.type': 'Type',
    'table.value': 'Value (€)',
    'buttons.addGoal': 'Add goal',
    'buttons.addAsset': 'Add asset or debt',
    'buttons.reloadExample': 'Reload example',
    'buttons.back': 'Back',
    'buttons.analyze': 'Run the analysis',
    'buttons.next': 'Next',
    'buttons.print': 'Print / PDF',
    'assets.presets.kicker': 'EXAMPLE SCENARIOS — CLICK TO PRE-FILL',
    'assets.presets.desc': 'Nine sample portfolios, from cautious to speculative extremes. Applying a scenario overwrites only the <b>five pillars</b>, leaving profile, age, crypto, income, expenses, and goals unchanged.',
    'assets.other.kicker': 'A · What you own beyond investments',
    'assets.other.kickerTitle': 'OTHER ASSETS AND DEBTS',
    'assets.other.desc': 'This is not investable capital: it calculates net worth and concentration. Disable anything you do not own.',
    'assets.other.detail': '— land, loans, cards, anything',
    'assets.home.title': 'Home',
    'assets.home.desc': 'Owned property — enter value and remaining mortgage',
    'assets.home.hint': 'If you have no mortgage, leave 0. If the home is rented or not yours, disable the switch.',
    'assets.car.title': 'Car',
    'assets.car.desc': 'Owned vehicles — enter value and remaining financing',
    'assets.car.hint': 'If the car is leased or you have no financing, leave 0 or disable it.',
    'assets.portfolio.kicker': 'B · Your portfolio — the 5 pillars',
    'assets.portfolio.desc': 'For each pillar enter <b>the total amount you own</b>. Unsure how to classify something? Read the subtitle: liquidity goes in P1, idle cash in P2, securities in P3, equity funds in P4, speculative assets in P5. Want a more precise tax and concentration estimate? Open “Detail positions”.',
    'assets.portfolio.total': 'Total financial assets:',
    'nav.next': 'Next items',
    'footer.quote': '“You do not need a perfect portfolio. You need a consistent portfolio that is easy to maintain.”',
    'footer.disclaimer': '<b>Disclaimer.</b> This tool provides a mathematical and informational simulation based on user-provided data. It is not personalized financial, tax, or legal advice. Investment decisions must account for individual circumstances and the instruments actually available.'
  }
};

let currentLanguage = 'it';

function getTranslation(key) {
  return (TRANSLATIONS[currentLanguage] && TRANSLATIONS[currentLanguage][key]) ||
    TRANSLATIONS.it[key] || key;
}

function applyTranslations() {
  document.documentElement.lang = currentLanguage;
  document.title = getTranslation('meta.title');
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const value = getTranslation(element.dataset.i18n);
    if (element.hasAttribute('data-i18n-html')) element.innerHTML = value;
    else element.textContent = value;
  });
  document.querySelectorAll('[data-i18n-title]').forEach((element) => {
    element.title = getTranslation(element.dataset.i18nTitle);
  });
}

function setLanguage(language) {
  if (!TRANSLATIONS[language] || language === currentLanguage) return;
  currentLanguage = language;
  applyTranslations();
  document.dispatchEvent(new CustomEvent('languagechange', { detail: { language } }));
}

window.I18N = {
  get language() { return currentLanguage; },
  setLanguage,
  applyTranslations,
  translations: TRANSLATIONS
};

document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
  const toggle = document.getElementById('lang-toggle');
  if (toggle) toggle.addEventListener('click', () => setLanguage(currentLanguage === 'it' ? 'en' : 'it'));
});

if (document.readyState !== 'loading') applyTranslations();
