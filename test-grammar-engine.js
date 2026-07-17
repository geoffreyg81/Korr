import { correctFrenchText } from "./grammar-engine.js";

const cases = [
  ["Je suis aller au magasin hier.", "Je suis allé au magasin hier."],
  ["Ils est parti hier.", "Ils sont partis hier."],
  ["Je sui aler au magasain hier.", "Je suis allé au magasin hier."],
  ["Les voiture rouge roule vite.", "Les voitures rouges roulent vite."],
  ["Je suis allé aux magasin hier.", "Je suis allé au magasin hier."],
  ["Je suis aller au magasins hier.", "Je suis allé au magasin hier."],
  ["Je suis aller au deux magasins voisins.", "Je suis allé aux deux magasins voisins."],
  ["Je te laisse.hésite pas à appeler. N’hésite pas à écrire.", "Je te laisse. N’hésite pas à appeler. N’hésite pas à écrire."],
  [
    "Mon réveil n’a pas soné. Ces vraiment dommage : il a fallu pourl’écrire. C’est p-etre la chaleur. Jepenseque les chevaux devrait avoir soiffe. Il faut s’enrendre compte. Les fleurs on déjà fannés.",
    "Mon réveil n’a pas sonné. C’est vraiment dommage : il a fallu pour l’écrire. C’est peut-être la chaleur. Je pense que les chevaux devraient avoir soif. Il faut s’en rendre compte. Les fleurs sont déjà fanées."
  ],
  [
    "J’aimeraisbien lire parceque le dossier surlequel on travaille est important. Il etait deja partit. Les températures devraient baisser unpeu desfois. On se voit bientôt j’éspère !",
    "J’aimerais bien lire parce que le dossier sur lequel on travaille est important. Il était déjà parti. Les températures devraient baisser un peu des fois. On se voit bientôt j’espère !"
  ],
  [
    "Saluuuute cava bi1 ??? frenchemen jss tro degouté de s'ki c'est passé s'matin... jme sui levé superto pr alé au boulo mè la voitur a pasvoulu démaré. j'ai essaillé de tourné laclé milfoi mè ien a fair. ducou g du prendr lebus sousla plui et bienentendu jss arivé toumouillé. monchef ma regardé d'untravers genre j'avé fai exprè !\n\njesper ke toi ojourdui sa spasse mieu. aparamen il va fair encorpire s'taprem. fopa kon oubli k'on doi s'voir s'soir pourl'aniv a marie. tu croi kel va aimé l'kado k'on a pri pourell ? j'ai l'impresionk c'est unpeuchere mèbon on navé pad'autridé.\n\nr'apel mwa d'k tu voi s'mesage pck jdoi te demandé kekchoz d'inportan surlekel j'hesit grav. a toute !!",
    "Salut, ça va bien ??? Franchement je suis trop dégoûté de ce qui s’est passé ce matin… Je me suis levé super tôt pour aller au boulot mais la voiture n’a pas voulu démarrer. J’ai essayé de tourner la clé mille fois mais rien à faire. Du coup j’ai dû prendre le bus sous la pluie et bien entendu je suis arrivé tout mouillé. Mon chef m’a regardé de travers, genre j’avais fait exprès !\n\nJ’espère que toi aujourd’hui ça se passe mieux. Apparemment il va faire encore pire cet après-midi. Faut pas qu’on oublie qu’on doit se voir ce soir pour l’anniversaire de Marie. Tu crois qu’elle va aimer le cadeau qu’on a pris pour elle ? J’ai l’impression que c’est un peu cher mais bon, on n’avait pas d’autre idée.\n\nRappelle-moi dès que tu vois ce message parce que je dois te demander quelque chose d’important sur lequel j’hésite beaucoup. À toute !"
  ],
  [
    "Bien que les responsables soient annoncés que les nouvelles mesures entreraient en vigueur dès lundi, plusieurs employés ce sont plaint de ne pas avoir été prévenu à temps. Les informations qu’ils ont reçu leur semblaient contradictoire, et certains se demandaient s’il fallait continuer à appliquer les anciennes procédures ou attendre que la direction leur donne des consignes plus claires. Marie, qui s’était permise de contacter directement le directeur, c’est aperçu que les documents envoyés la veille comportaient eux aussi plusieurs erreurs, ce qui à provoquer davantage de confusion parmi les équipes.",
    "Bien que les responsables aient annoncé que les nouvelles mesures entreraient en vigueur dès lundi, plusieurs employés se sont plaints de ne pas avoir été prévenus à temps. Les informations qu’ils ont reçues leur semblaient contradictoires, et certains se demandaient s’il fallait continuer à appliquer les anciennes procédures ou attendre que la direction leur donne des consignes plus claires. Marie, qui s’était permis de contacter directement le directeur, s’est aperçue que les documents envoyés la veille comportaient eux aussi plusieurs erreurs, ce qui a provoqué davantage de confusion parmi les équipes."
  ],
  // Généralisation SMS : phrases jamais vues par la table de la démo.
  [
    "slt ct cool la soiré dhier jai bcp aimé mé jené un peu fatigué",
    "Salut c’était cool la soirée d’hier j’ai beaucoup aimé, mais j’étais un peu fatigué"
  ],
  [
    "jvai o ciné avc mé pote se soir tu vyn?",
    "Je vais au ciné avec mes potes ce soir tu viens ?"
  ],
  ["dsl jpe pa vnir jsui malad", "Désolé je peux pas venir je suis malade"],
  [
    "cc sava? tkt pr dmn jsp si jpe venir mé jte tiens o courant",
    "Coucou ça va ? T’inquiète pour demain je ne sais pas si je peux venir, mais je te tiens au courant"
  ],
  [
    "bjr, jspr que tu va bien. rdv 2m1 mat1 pr le ptit dej stp",
    "Bonjour, j’espère que tu vas bien. Rendez-vous demain matin pour le petit déjeuner s’il te plaît"
  ],
  [
    "mdr jss mort de rire, keske tu fé ce soir? ya un truc o bar avc kelkun que tu connais",
    "Mdr je suis mort de rire, qu’est-ce que tu fais ce soir ? Il y a un truc au bar avec quelqu’un que tu connais"
  ],
  [
    "koi29? sa fait lgtmp! fo kon se voit bi1to paske jai plein de truc a te raconter",
    "Quoi de neuf ? Ça fait longtemps ! Faut qu’on se voit bientôt parce que j’ai plein de trucs à te raconter"
  ],
  [
    "dcp jvx bien venir mé chépa si ya la place",
    "Du coup je veux bien venir, mais je ne sais pas s’il y a la place"
  ],
  ["vazy tkl on se capte apré, a+", "Vas-y tranquille on se capte après, à plus"],
  ["ca marche, askip tlm sera la dmn", "Ça marche, à ce qu’il paraît tout le monde sera là demain"],
  [
    "pk tu ma pa dit ca deja? cest pas grave jte pardonne",
    "Pourquoi tu m’as pas dit ça déjà ? C’est pas grave je te pardonne"
  ],
  // Élision « ma/ta + participe » et « deja », actives aussi hors mode SMS.
  ["il ma fait un cadeau, elle ta rien dit?", "Il m’a fait un cadeau, elle t’a rien dit?"],
  [
    "Le chiffre du CA est en hausse, deja 3% de mieux que prévu.",
    "Le chiffre du CA est en hausse, déjà 3% de mieux que prévu."
  ],
  // La règle « infi » de Grammalecte est spéculative : elle ne s’applique que
  // là où un infinitif est attendu, sinon « venir demain désolé » devenait
  // « désoler ».
  ["jpe pa venir dmn dsl", "Je peux pas venir demain désolé"],
  ["je vais mangé", "Je vais manger"],
  ["C’est pour mangé.", "C’est pour manger."],
  ["Je dois partir sans mangé.", "Je dois partir sans manger."],
  // Deux corrections concurrentes pour la même faute : le contexte tranche.
  // « à mangé » se répare en « à manger », pas en « a mangé ».
  ["Il commence à mangé.", "Il commence à manger."],
  ["Il a mangé une pomme.", "Il a mangé une pomme."],
  // Le contexte départage les suggestions de Grammalecte : « ce » → « cette »
  // ou « se », « vien » → « vie » ou « viens ». Prendre la première dégradait
  // le texte.
  ["Il ce lave les mains.", "Il se lave les mains."],
  ["Quand est-ce que tu vien ?", "Quand est-ce que tu viens ?"],
  // Homophones et/est et ou/où, que Grammalecte ne signale pas seul.
  ["Elle et partie tôt.", "Elle est partie tôt."],
  ["Il et content de venir.", "Il est content de venir."],
  ["Ou est-il passé ?", "Où est-il passé ?"],
  ["Ou vas-tu ce soir ?", "Où vas-tu ce soir ?"],
  // La nature du mot protège les coordinations légitimes.
  ["Elle et moi partons demain.", "Elle et moi partons demain."],
  ["Elle et Marie sont parties.", "Elle et Marie sont parties."],
  ["Elle et lui sont arrivés.", "Elle et lui sont arrivés."],
  ["Elle et sa sœur viennent.", "Elle et sa sœur viennent."],
  ["Il est grand et beau.", "Il est grand et beau."],
  ["Tu viens ou est-ce que tu restes ?", "Tu viens ou est-ce que tu restes ?"],
  ["Ou bien tu viens, ou bien tu restes.", "Ou bien tu viens, ou bien tu restes."],
  ["Il parle à Marie et à Paul.", "Il parle à Marie et à Paul."],
  // Concordance : « si » à l’imparfait appelle le conditionnel dans la
  // principale, jamais le futur.
  ["Si j’avais su, je n’y serai pas allé.", "Si j’avais su, je n’y serais pas allé."],
  ["Si tu venais, je serai content.", "Si tu venais, je serais content."],
  ["Si j’avais le temps, je ferai le ménage.", "Si j’avais le temps, je ferais le ménage."],
  // Avec « si » au présent, le futur est correct.
  ["Si tu viens, je serai là.", "Si tu viens, je serai là."],
  ["Si tu as le temps, nous irons au cinéma.", "Si tu as le temps, nous irons au cinéma."],
  // Accord du COD placé avant, là où un mot suit le participe.
  [
    "Les décisions que la direction a pris la semaine dernière sont mauvaises.",
    "Les décisions que la direction a prises la semaine dernière sont mauvaises."
  ],
  ["Les livres que j’ai lu hier étaient bons.", "Les livres que j’ai lus hier étaient bons."],
  [
    "Les lettres que Paul a écrit hier sont longues.",
    "Les lettres que Paul a écrites hier sont longues."
  ],
  ["La voiture que j’ai vendu hier était rouge.", "La voiture que j’ai vendue hier était rouge."],
  // Garde-fous de l’accord : « que » conjonction, « fait » devant infinitif,
  // « été » invariable, et « gens » épicène donc indécidable.
  ["Je pense que la direction a pris une décision.", "Je pense que la direction a pris une décision."],
  ["Il dit que Paul a mangé une pomme.", "Il dit que Paul a mangé une pomme."],
  [
    "Les documents que je t’ai fait parvenir sont urgents.",
    "Les documents que je t’ai fait parvenir sont urgents."
  ],
  ["Les idiots que nous avons été autrefois.", "Les idiots que nous avons été autrefois."],
  ["Les fleurs que j’ai achetées hier sont belles.", "Les fleurs que j’ai achetées hier sont belles."],
  // Concordance des temps, subjonctif et construction verbale.
  ["Si j’aurais su, je ne serais pas venu.", "Si j’avais su, je ne serais pas venu."],
  ["Si je serais riche, je voyagerais.", "Si j’étais riche, je voyagerais."],
  ["Si tu pourrais venir, ce serait bien.", "Si tu pouvais venir, ce serait bien."],
  ["Bien que Paul a raison, il se tait.", "Bien que Paul ait raison, il se tait."],
  ["Bien qu’il est fatigué, il continue.", "Bien qu’il soit fatigué, il continue."],
  ["Quoique tu as tort, je te pardonne.", "Quoique tu aies tort, je te pardonne."],
  ["J’ai préféré de partir tôt.", "J’ai préféré partir tôt."],
  // Garde-fous : le « si » interrogatif admet le conditionnel, « de loin » et
  // un subjonctif déjà correct ne doivent pas être touchés.
  [
    "Je me demande si j’aurais dû accepter cette offre.",
    "Je me demande si j’aurais dû accepter cette offre."
  ],
  ["Il préfère de loin cette solution à l’autre.", "Il préfère de loin cette solution à l’autre."],
  ["Bien qu’il ait déjà mangé, il a encore faim.", "Bien qu’il ait déjà mangé, il a encore faim."],
  ["Si tu avais su, tu serais venu plus tôt.", "Si tu avais su, tu serais venu plus tôt."],
  ["Il sera là demain, et il aura fini son rapport.", "Il sera là demain, et il aura fini son rapport."],
  [
    "Je ne sais pas si nous serions capables de le faire.",
    "Je ne sais pas si nous serions capables de le faire."
  ],
  // Garde-fous : les textes soignés ne doivent pas déclencher le mode SMS.
  [
    "Bonjour, je vous confirme le rendez-vous de demain à 10h30 au bureau. Cordialement.",
    "Bonjour, je vous confirme le rendez-vous de demain à 10h30 au bureau. Cordialement."
  ],
  [
    "Le rapport du CT est validé, la PR est prête pour relecture.",
    "Le rapport du CT est validé, la PR est prête pour relecture."
  ],
  [
    "Salutation ! Je t’écris ce petit message pour te raconter ma journée d’hier qui c’est très mal passé. J’aimerais bien que tu lises ça attentivement. Tout d’abords, je me suis réveillé en retard parce que mon réveil n’a pas sonne. J’ai couru pour rattraper le bus, mais il était déjà parti.\n\nEnsuite, quand je suis arrivé au bureau, mes collègues m’ont dit que j’avais oublié le dossier sur lequel on n’a travaillé toutes la semaine. Ce vraiment dommage vu l’effort qu’on n’y a mit et le temps qu’il nous a fallu pourléchait.\n\nLes quelques fleurs que j’ai cueilli dans le jardin ce matin ont est déjà fane. C’est pierre à cause de la chaleur qu’il fait en ce moment. Repense les températures devrait baisser un peu des fois. Les chevaux que j’ai vus dans les champs d’a coté avait l’air d’avoir coiffe eux aussi. Même les petits oiseaux ne chantaient plus, s’enrênerait compte fait un peu mal au cœur.\n\nJe te laisse, faut que j’y aille. Hésite pas à m’appeler si tu as besoin de quoi que se soit. On se voit très bientôt j’espère !",
    "Salutations ! Je t’écris ce petit message pour te raconter ma journée d’hier qui s’est très mal passée. J’aimerais bien que tu lises ça attentivement. Tout d’abord, je me suis réveillé en retard parce que mon réveil n’a pas sonné. J’ai couru pour rattraper le bus, mais il était déjà parti.\n\nEnsuite, quand je suis arrivé au bureau, mes collègues m’ont dit que j’avais oublié le dossier sur lequel on a travaillé toute la semaine. C’est vraiment dommage vu l’effort qu’on y a mis et le temps qu’il nous a fallu pour l’écrire.\n\nLes quelques fleurs que j’ai cueillies dans le jardin ce matin sont déjà fanées. C’est peut-être à cause de la chaleur qu’il fait en ce moment. Je pense que les températures devraient baisser un peu des fois. Les chevaux que j’ai vus dans les champs d’à côté avaient l’air d’avoir soif eux aussi. Même les petits oiseaux ne chantaient plus. S’en rendre compte fait un peu mal au cœur.\n\nJe te laisse, faut que j’y aille. N’hésite pas à m’appeler si tu as besoin de quoi que ce soit. On se voit très bientôt, j’espère !"
  ]
];

let failures = 0;
for (const [input, expected] of cases) {
  const result = correctFrenchText(input);
  console.log(`${result.durationMs} ms | ${input} -> ${result.text}`);
  if (expected && result.text !== expected) failures += 1;
}

if (failures) {
  console.error(`${failures} correction(s) attendue(s) ont échoué.`);
  process.exitCode = 1;
}
