import type { Locale } from "@/lib/i18n";

type Scene = {
  eyebrow: string;
  title: string;
  body?: string;
  next?: string;
};

export type IntroCopy = {
  skip: string;
  soundOn: string;
  soundOff: string;
  demo: string;
  scene: (n: number) => string;
  create: string;
  created: string;
  transfer: string;
  transferred: string;
  askCore: string;
  coreAnswer: string;
  coreKnows: string;
  coreDoesNotKnow: string;
  next: string;
  finish: string;
  replay: string;
  experiment: string;
  systemA: string;
  externalApplication: string;
  externalModel: string;
  coreNeutral: string;
  meridianReads: string;
  meridianExternal: string;
  coreNotPrice: string;
  chooseMeaning: string;
  meanings: string[];
  compare: string;
  challengeTitle: string;
  challengeLead: string;
  challengeQuestions: string[];
  challengeAnswers: string[];
  declarations: string;
  architecture: string;
  transparency: string;
  coreQuantity: string;
  coreOrder: string;
  coreRecord: string;
  externalValue: string;
  externalPrice: string;
  externalPurpose: string;
  externalMeaning: string;
  finalTitle: string;
  finalBody: string;
  scenes: Scene[];
};

const en: IntroCopy = {
  skip: "Skip",
  soundOn: "Mute introduction sound",
  soundOff: "Enable introduction sound",
  demo: "Isolated demonstration — no production ledger is changed",
  scene: (n) => `Scene ${n}`,
  create: "CREATE 100 A",
  created: "CORE RECORD · init_credit · +100 A",
  transfer: "TRANSFER 30 A",
  transferred: "CORE RECORD · transfer · 30 A",
  askCore: "Ask the Core",
  coreAnswer: "Core records quantity. It does not assign meaning.",
  coreKnows: "CORE KNOWS",
  coreDoesNotKnow: "CORE DOES NOT KNOW",
  next: "Continue",
  finish: "Explore System A",
  replay: "Replay introduction",
  experiment: "Interactive introduction",
  systemA: "SYSTEM A",
  externalApplication: "EXTERNAL APPLICATION",
  externalModel: "EXTERNAL MODEL",
  coreNeutral: "NEUTRAL CORE",
  meridianReads: "Meridian reads and interprets information externally.",
  meridianExternal: "External interpretation does not change System A.",
  coreNotPrice: "Core records quantitative state. It does not create an internal price for A.",
  chooseMeaning: "What is A?",
  meanings: ["Money", "Asset", "Number", "Contract", "Something else"],
  compare: "Now compare your interpretation with what Core actually knows.",
  challengeTitle: "CHALLENGE SYSTEM A",
  challengeLead: "Try to prove that System A is something it does not claim to be.",
  challengeQuestions: [
    "Does Core know the price?",
    "Does Core create a claim?",
    "Does Core know why A was transferred?",
    "Does GRM create an internal price?",
    "Does Meridian become part of System A?",
    "Does an external transaction change Core history?",
  ],
  challengeAnswers: [
    "NO. Core records quantitative state. Pricing, if any, belongs to an external application.",
    "NO. A Core record is a formal quantity record, not a claim or guarantee.",
    "NO. Core validates the operation, not its external cause or purpose.",
    "NO. GRM is an external analytical model and does not become a Core property.",
    "NO. Meridian remains a separate external application.",
    "NO. Only an accepted Core operation changes Core history.",
  ],
  declarations: "Read the declarations",
  architecture: "Architecture",
  transparency: "Transparency",
  coreQuantity: "quantity",
  coreOrder: "operation",
  coreRecord: "record",
  externalValue: "value",
  externalPrice: "price",
  externalPurpose: "purpose",
  externalMeaning: "economic meaning",
  finalTitle: "A system that records quantity.",
  finalBody: "Without assigning it value. Now decide what you think it means.",
  scenes: [
    { eyebrow: "01 / THE QUESTION", title: "A is not money.\nNot an asset.\nNot an investment.\nNot a price.", body: "So what is it?", next: "Scroll to begin" },
    { eyebrow: "02 / CREATION", title: "Something changes.", body: "A formal record appears — not a balance with a monetary meaning." },
    { eyebrow: "03 / TRANSFER", title: "A quantity moves between identifiers.", body: "The record changes. The meaning is still outside it." },
    { eyebrow: "04 / THE CORE", title: "Ask the Core.", body: "The answer is deliberately smaller than the question." },
    { eyebrow: "05 / THE BOUNDARY", title: "CORE ≠ INTERPRETATION", body: "Two contours. One formal record. No transfer of meaning." },
    { eyebrow: "06 / MERIDIAN", title: "A separate external layer.", body: "GRM lives outside Core." },
    { eyebrow: "07 / YOUR INTERPRETATION", title: "What is A?", body: "Choose an interpretation, then compare it with the record." },
    { eyebrow: "08 / THE CHALLENGE", title: "Test the boundary.", body: "Open each question. The declarations are the reference." },
    { eyebrow: "09 / VERIFY", title: "Don't trust the presentation.", body: "Check the system." },
  ],
};

const ru: IntroCopy = {
  ...en,
  skip: "Пропустить",
  soundOn: "Выключить звук вступления",
  soundOff: "Включить звук вступления",
  demo: "Изолированная демонстрация — рабочий реестр не изменяется",
  scene: (n) => `Сцена ${n}`,
  create: "СОЗДАТЬ 100 A",
  created: "ЗАПИСЬ CORE · init_credit · +100 A",
  transfer: "ПЕРЕДАТЬ 30 A",
  transferred: "ЗАПИСЬ CORE · transfer · 30 A",
  askCore: "Спросить Core",
  coreAnswer: "Core фиксирует количество. Он не назначает смысл.",
  coreKnows: "CORE ЗНАЕТ",
  coreDoesNotKnow: "CORE НЕ ЗНАЕТ",
  next: "Продолжить",
  finish: "Открыть System A",
  replay: "Посмотреть вступление ещё раз",
  experiment: "Интерактивное вступление",
  systemA: "SYSTEM A",
  externalApplication: "ВНЕШНЕЕ ПРИЛОЖЕНИЕ",
  externalModel: "ВНЕШНЯЯ МОДЕЛЬ",
  coreNeutral: "НЕЙТРАЛЬНЫЙ CORE",
  meridianReads: "Meridian читает и интерпретирует информацию во внешнем контуре.",
  meridianExternal: "Внешняя интерпретация не изменяет System A.",
  coreNotPrice: "Core фиксирует количественное состояние. Он не создаёт внутреннюю цену A.",
  chooseMeaning: "Что такое A?",
  meanings: ["Деньги", "Актив", "Число", "Договор", "Другое"],
  compare: "Сравните свою интерпретацию с тем, что действительно знает Core.",
  challengeTitle: "ПРОВЕРЬТЕ SYSTEM A",
  challengeLead: "Попробуйте доказать, что System A — это то, чем она себя не объявляет.",
  challengeQuestions: [
    "Знает ли Core цену?",
    "Создаёт ли Core требование?",
    "Знает ли Core, почему A передали?",
    "Создаёт ли GRM внутреннюю цену?",
    "Становится ли Meridian частью System A?",
    "Изменяет ли внешняя транзакция историю Core?",
  ],
  challengeAnswers: [
    "НЕТ. Core фиксирует количество. Цена, если она существует, принадлежит внешнему приложению.",
    "НЕТ. Запись Core — формальная запись количества, а не требование и не гарантия.",
    "НЕТ. Core проверяет допустимость операции, а не её внешнюю причину.",
    "НЕТ. GRM — внешняя аналитическая модель, а не свойство Core.",
    "НЕТ. Meridian остаётся отдельным внешним приложением.",
    "НЕТ. Историю Core изменяет только принятая операция Core.",
  ],
  declarations: "Прочитать декларации",
  architecture: "Архитектура",
  transparency: "Прозрачность",
  coreQuantity: "количество",
  coreOrder: "операция",
  coreRecord: "запись",
  externalValue: "стоимость",
  externalPrice: "цена",
  externalPurpose: "назначение",
  externalMeaning: "экономический смысл",
  finalTitle: "Система, которая фиксирует количество.",
  finalBody: "Не назначая ему стоимость. Теперь решите сами, что это означает.",
  scenes: [
    { eyebrow: "01 / ВОПРОС", title: "A — не деньги.\nНе актив.\nНе инвестиция.\nНе цена.", body: "Тогда что это?", next: "Прокрутите, чтобы начать" },
    { eyebrow: "02 / СОЗДАНИЕ", title: "Что-то изменилось.", body: "Появляется формальная запись — не банковский баланс и не денежное значение." },
    { eyebrow: "03 / ПЕРЕДАЧА", title: "Количество перемещается между идентификаторами.", body: "Запись изменяется. Смысл всё ещё находится вне неё." },
    { eyebrow: "04 / CORE", title: "Спросите Core.", body: "Ответ намеренно меньше самого вопроса." },
    { eyebrow: "05 / ГРАНИЦА", title: "CORE ≠ ИНТЕРПРЕТАЦИЯ", body: "Два контура. Одна формальная запись. Без переноса смысла." },
    { eyebrow: "06 / MERIDIAN", title: "Отдельный внешний слой.", body: "GRM находится вне Core." },
    { eyebrow: "07 / ВАША ИНТЕРПРЕТАЦИЯ", title: "Что такое A?", body: "Выберите интерпретацию и сравните её с записью." },
    { eyebrow: "08 / ПРОВЕРКА", title: "Проверьте границу.", body: "Откройте каждый вопрос. Источник ответа — декларации." },
    { eyebrow: "09 / ПРОВЕРЬТЕ", title: "Не верьте презентации на слово.", body: "Проверьте систему." },
  ],
};

const zh: IntroCopy = {
  ...en,
  skip: "跳过",
  soundOn: "关闭引导声音",
  soundOff: "开启引导声音",
  demo: "隔离演示——不会改变生产登记簿",
  scene: (n) => `场景 ${n}`,
  create: "创建 100 A",
  created: "CORE 记录 · init_credit · +100 A",
  transfer: "转移 30 A",
  transferred: "CORE 记录 · transfer · 30 A",
  askCore: "询问 Core",
  coreAnswer: "Core 记录数量，但不赋予意义。",
  coreKnows: "CORE 知道",
  coreDoesNotKnow: "CORE 不知道",
  next: "继续",
  finish: "探索 System A",
  replay: "再次查看引导",
  experiment: "交互式引导",
  systemA: "SYSTEM A",
  externalApplication: "外部应用",
  externalModel: "外部模型",
  coreNeutral: "中立 CORE",
  meridianReads: "Meridian 在外部读取并解释信息。",
  meridianExternal: "外部解释不会改变 System A。",
  coreNotPrice: "Core 记录数量状态，不会在内部为 A 创造价格。",
  chooseMeaning: "A 是什么？",
  meanings: ["货币", "资产", "数字", "合约", "其他"],
  compare: "现在将你的解释与 Core 实际知道的内容进行比较。",
  challengeTitle: "挑战 SYSTEM A",
  challengeLead: "尝试证明 System A 是它自己没有声明的东西。",
  challengeQuestions: ["Core 知道价格吗？", "Core 创造请求权吗？", "Core 知道 A 为什么被转移吗？", "GRM 创造内部价格吗？", "Meridian 成为 System A 的一部分吗？", "外部交易会改变 Core 历史吗？"],
  challengeAnswers: ["不。Core 记录数量状态；价格（如果存在）属于外部应用。", "不。Core 记录是数量记录，不是请求权或保证。", "不。Core 验证操作，不验证外部原因。", "不。GRM 是外部分析模型，不是 Core 属性。", "不。Meridian 仍是独立的外部应用。", "不。只有被 Core 接受的操作会改变 Core 历史。"],
  declarations: "阅读声明",
  architecture: "架构",
  transparency: "透明度",
  coreQuantity: "数量",
  coreOrder: "操作",
  coreRecord: "记录",
  externalValue: "价值",
  externalPrice: "价格",
  externalPurpose: "目的",
  externalMeaning: "经济含义",
  finalTitle: "一个记录数量的系统。",
  finalBody: "但不为它赋予价值。现在，请决定你认为它意味着什么。",
  scenes: [
    { eyebrow: "01 / 问题", title: "A 不是货币。\n不是资产。\n不是投资。\n不是价格。", body: "那么它是什么？", next: "滚动开始" },
    { eyebrow: "02 / 创建", title: "某些东西发生了变化。", body: "一条形式记录出现了——不是带有货币含义的银行余额。" },
    { eyebrow: "03 / 转移", title: "数量在标识符之间移动。", body: "记录改变了，但意义仍在记录之外。" },
    { eyebrow: "04 / CORE", title: "询问 Core。", body: "答案故意比问题更小。" },
    { eyebrow: "05 / 边界", title: "CORE ≠ 解释", body: "两个环境。一条形式记录。不转移意义。" },
    { eyebrow: "06 / MERIDIAN", title: "独立的外部层。", body: "GRM 位于 Core 之外。" },
    { eyebrow: "07 / 你的解释", title: "A 是什么？", body: "选择一个解释，然后与记录比较。" },
    { eyebrow: "08 / 挑战", title: "测试边界。", body: "打开每个问题。声明是参考来源。" },
    { eyebrow: "09 / 验证", title: "不要相信演示本身。", body: "检查系统。" },
  ],
};

const fr: IntroCopy = {
  ...en,
  skip: "Passer",
  soundOn: "Couper le son de l’introduction",
  soundOff: "Activer le son de l’introduction",
  demo: "Démonstration isolée — le registre de production n’est pas modifié",
  scene: (n) => `Scène ${n}`,
  create: "CRÉER 100 A",
  created: "ENREGISTREMENT CORE · init_credit · +100 A",
  transfer: "TRANSFÉRER 30 A",
  transferred: "ENREGISTREMENT CORE · transfer · 30 A",
  askCore: "Interroger le Core",
  coreAnswer: "Le Core enregistre la quantité. Il n’attribue pas de sens.",
  coreKnows: "LE CORE SAIT",
  coreDoesNotKnow: "LE CORE NE SAIT PAS",
  next: "Continuer",
  finish: "Explorer System A",
  replay: "Revoir l’introduction",
  experiment: "Introduction interactive",
  systemA: "SYSTEM A",
  externalApplication: "APPLICATION EXTERNE",
  externalModel: "MODÈLE EXTERNE",
  coreNeutral: "CORE NEUTRE",
  meridianReads: "Meridian lit et interprète les informations à l’extérieur.",
  meridianExternal: "L’interprétation externe ne modifie pas System A.",
  coreNotPrice: "Le Core enregistre un état quantitatif. Il ne crée pas de prix interne pour A.",
  chooseMeaning: "Qu’est-ce que A ?",
  meanings: ["Argent", "Actif", "Nombre", "Contrat", "Autre"],
  compare: "Comparez maintenant votre interprétation avec ce que le Core sait réellement.",
  challengeTitle: "DÉFIEZ SYSTEM A",
  challengeLead: "Essayez de prouver que System A est ce qu’elle ne prétend pas être.",
  challengeQuestions: ["Le Core connaît-il le prix ?", "Le Core crée-t-il une créance ?", "Le Core sait-il pourquoi A a été transféré ?", "Le GRM crée-t-il un prix interne ?", "Meridian devient-il une partie de System A ?", "Une transaction externe modifie-t-elle l’historique du Core ?"],
  challengeAnswers: ["NON. Le Core enregistre une quantité. Le prix éventuel appartient à une application externe.", "NON. Un enregistrement du Core est une quantité formelle, pas une créance ni une garantie.", "NON. Le Core valide l’opération, pas sa cause externe.", "NON. Le GRM est un modèle analytique externe, pas une propriété du Core.", "NON. Meridian reste une application externe distincte.", "NON. Seule une opération acceptée par le Core modifie son historique."],
  declarations: "Lire les déclarations",
  architecture: "Architecture",
  transparency: "Transparence",
  coreQuantity: "quantité",
  coreOrder: "opération",
  coreRecord: "enregistrement",
  externalValue: "valeur",
  externalPrice: "prix",
  externalPurpose: "but",
  externalMeaning: "sens économique",
  finalTitle: "Un système qui enregistre une quantité.",
  finalBody: "Sans lui attribuer une valeur. Décidez maintenant ce que cela signifie pour vous.",
  scenes: [
    { eyebrow: "01 / LA QUESTION", title: "A n’est pas de l’argent.\nPas un actif.\nPas un investissement.\nPas un prix.", body: "Alors, qu’est-ce que c’est ?", next: "Faites défiler pour commencer" },
    { eyebrow: "02 / CRÉATION", title: "Quelque chose change.", body: "Un enregistrement formel apparaît — pas un solde bancaire doté d’un sens monétaire." },
    { eyebrow: "03 / TRANSFERT", title: "Une quantité se déplace entre des identifiants.", body: "L’enregistrement change. Le sens reste à l’extérieur." },
    { eyebrow: "04 / LE CORE", title: "Interrogez le Core.", body: "La réponse est volontairement plus petite que la question." },
    { eyebrow: "05 / LA FRONTIÈRE", title: "CORE ≠ INTERPRÉTATION", body: "Deux contours. Un enregistrement formel. Aucun transfert de sens." },
    { eyebrow: "06 / MERIDIAN", title: "Une couche externe distincte.", body: "Le GRM vit à l’extérieur du Core." },
    { eyebrow: "07 / VOTRE INTERPRÉTATION", title: "Qu’est-ce que A ?", body: "Choisissez une interprétation, puis comparez-la à l’enregistrement." },
    { eyebrow: "08 / LE DÉFI", title: "Testez la frontière.", body: "Ouvrez chaque question. Les déclarations sont la référence." },
    { eyebrow: "09 / VÉRIFIER", title: "Ne faites pas confiance à la présentation.", body: "Vérifiez le système." },
  ],
};

const es: IntroCopy = {
  ...en,
  skip: "Omitir",
  soundOn: "Silenciar el sonido de introducción",
  soundOff: "Activar el sonido de introducción",
  demo: "Demostración aislada — no cambia el registro de producción",
  scene: (n) => `Escena ${n}`,
  create: "CREAR 100 A",
  created: "REGISTRO CORE · init_credit · +100 A",
  transfer: "TRANSFERIR 30 A",
  transferred: "REGISTRO CORE · transfer · 30 A",
  askCore: "Preguntar al Core",
  coreAnswer: "Core registra cantidad. No asigna significado.",
  coreKnows: "CORE SABE",
  coreDoesNotKnow: "CORE NO SABE",
  next: "Continuar",
  finish: "Explorar System A",
  replay: "Repetir introducción",
  experiment: "Introducción interactiva",
  systemA: "SYSTEM A",
  externalApplication: "APLICACIÓN EXTERNA",
  externalModel: "MODELO EXTERNO",
  coreNeutral: "CORE NEUTRAL",
  meridianReads: "Meridian lee e interpreta la información externamente.",
  meridianExternal: "La interpretación externa no cambia System A.",
  coreNotPrice: "Core registra el estado cuantitativo. No crea un precio interno para A.",
  chooseMeaning: "¿Qué es A?",
  meanings: ["Dinero", "Activo", "Número", "Contrato", "Otra cosa"],
  compare: "Compara tu interpretación con lo que Core realmente sabe.",
  challengeTitle: "DESAFÍA A SYSTEM A",
  challengeLead: "Intenta demostrar que System A es algo que no afirma ser.",
  challengeQuestions: ["¿Core conoce el precio?", "¿Core crea un derecho de cobro?", "¿Core sabe por qué se transfirió A?", "¿GRM crea un precio interno?", "¿Meridian se convierte en parte de System A?", "¿Una transacción externa cambia el historial de Core?"],
  challengeAnswers: ["NO. Core registra cantidad. El precio, si existe, pertenece a una aplicación externa.", "NO. Un registro de Core es una cantidad formal, no un derecho ni una garantía.", "NO. Core valida la operación, no su causa externa.", "NO. GRM es un modelo analítico externo, no una propiedad de Core.", "NO. Meridian sigue siendo una aplicación externa independiente.", "NO. Solo una operación aceptada por Core cambia su historial."],
  declarations: "Leer las declaraciones",
  architecture: "Arquitectura",
  transparency: "Transparencia",
  coreQuantity: "cantidad",
  coreOrder: "operación",
  coreRecord: "registro",
  externalValue: "valor",
  externalPrice: "precio",
  externalPurpose: "propósito",
  externalMeaning: "significado económico",
  finalTitle: "Un sistema que registra cantidad.",
  finalBody: "Sin asignarle valor. Ahora decide qué crees que significa.",
  scenes: [
    { eyebrow: "01 / LA PREGUNTA", title: "A no es dinero.\nNo es un activo.\nNo es una inversión.\nNo es un precio.", body: "Entonces, ¿qué es?", next: "Desplázate para comenzar" },
    { eyebrow: "02 / CREACIÓN", title: "Algo cambia.", body: "Aparece un registro formal — no un saldo bancario con significado monetario." },
    { eyebrow: "03 / TRANSFERENCIA", title: "Una cantidad se mueve entre identificadores.", body: "El registro cambia. El significado sigue fuera de él." },
    { eyebrow: "04 / EL CORE", title: "Pregunta al Core.", body: "La respuesta es deliberadamente menor que la pregunta." },
    { eyebrow: "05 / EL LÍMITE", title: "CORE ≠ INTERPRETACIÓN", body: "Dos contornos. Un registro formal. Sin transferencia de significado." },
    { eyebrow: "06 / MERIDIAN", title: "Una capa externa independiente.", body: "GRM vive fuera de Core." },
    { eyebrow: "07 / TU INTERPRETACIÓN", title: "¿Qué es A?", body: "Elige una interpretación y compárala con el registro." },
    { eyebrow: "08 / EL DESAFÍO", title: "Prueba el límite.", body: "Abre cada pregunta. Las declaraciones son la referencia." },
    { eyebrow: "09 / VERIFICAR", title: "No confíes en la presentación.", body: "Comprueba el sistema." },
  ],
};

export const INTRO_TRANSLATIONS: Record<Locale, IntroCopy> = { en, ru, zh, fr, es };
