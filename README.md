# Korr - correcteur français local

Extension Edge/Chrome qui corrige le français directement dans les champs de
saisie. Gratuite, sans clé API, sans abonnement, sans compte - et **hors
ligne** : le texte ne quitte jamais votre ordinateur.

L'extension embarque son propre moteur : elle s'installe et fonctionne, sans
rien d'autre à lancer. Une application de bureau facultative étend la
correction à toutes les applications Windows, et un backend facultatif ajoute
des styles de réécriture par IA.

## Correction instantanée (par défaut)

Moteur **Grammalecte 2.3.0** et règles maison, exécutés dans l'extension
elle-même :

- fautes d'orthographe, de grammaire, de conjugaison et d'accord ;
- accord du participe passé avec le COD placé avant l'auxiliaire ;
- concordance des temps, subjonctif après « bien que », homophones et/est
  et ou/où ;
- langage SMS : environ 180 abréviations et des règles contextuelles.

Le moteur se charge en deux secondes au démarrage du navigateur, puis chaque
correction prend quelques millisecondes.

## Styles de réécriture (facultatif, demandent le backend)

| Style | Effet |
| --- | --- |
| ✓ Corriger | Corrige les fautes sans rien reformuler (défaut, hors ligne). |
| 💼 Pro | Réécrit dans un ton professionnel et courtois. |
| 😊 Amical | Réécrit dans un ton chaleureux et détendu. |
| ✂️ Concis | Raccourcit le texte en gardant l'essentiel. |

Ces trois derniers passent par `gemma3:4b` via Ollama et n'apparaissent que si
le backend tourne. Sans lui, l'extension corrige seule et les masque.

Exemple en style Pro : « slt, jpe pa venir a la réunion dmn, dsl pour le
retard » devient « Je ne pourrai malheureusement pas être présent à la réunion
de demain. Veuillez excuser ce contretemps. »

Chaque style garde son garde-fou : une réponse IA trop éloignée du texte
d'origine est écartée au profit de la correction instantanée.

## Backend facultatif

L'extension n'en a pas besoin pour corriger : il ne sert qu'aux styles de
réécriture et à l'application de bureau. Depuis ce dossier :

```powershell
npm start
```

Attends le message :

```text
Correcteur instantané Grammalecte chargé.
```

Garde cette fenêtre ouverte pendant l’utilisation.

### Arrêter le backend

```powershell
npm stop
```

La commande retrouve le backend par le port qu’il écoute, et fonctionne donc
même quand il a été lancé sans fenêtre par le démarrage automatique - le cas où
`Ctrl+C` n’est d’aucun secours. `npm run restart` enchaîne l’arrêt et le
démarrage, ce qu’il faut faire après chaque modification du backend.

### Démarrage automatique (recommandé)

Pour ne plus y penser, active le lancement sans fenêtre à chaque ouverture de
session Windows :

```powershell
npm run autostart:install
```

`npm run autostart:remove` le désactive, `npm run autostart:status` vérifie
son état. Lancer `npm start` alors que le backend tourne déjà ne pose aucun
problème : la seconde instance l’indique et s’arrête aussitôt.

## Application de bureau : corriger partout

L’extension couvre le navigateur ; l’application de bureau couvre **tout le
reste** - Word, Discord, Bloc-notes, n’importe quel champ de n’importe quel
logiciel Windows. 100 % PowerShell natif : rien à installer.

```powershell
npm run app
```

Une icône ✓ violette apparaît dans la zone de notification. Ensuite, dans
n’importe quelle application :

1. Sélectionne du texte.
2. Appuie sur un raccourci.
3. La sélection est remplacée par le texte corrigé (Ctrl+Z pour annuler).

| Raccourci | Effet |
| --- | --- |
| **Ctrl+Alt+C** | Corrige avec le mode retenu (Instantané par défaut). |
| **Ctrl+Alt+P** | Réécrit en style professionnel (IA). |
| **Ctrl+Alt+A** | Réécrit en style amical (IA). |
| **Ctrl+Alt+R** | Raccourcit à l’essentiel (IA). |

Les trois derniers ne changent pas le mode retenu : ils valent pour une seule
correction. Le clic droit sur l’icône permet de changer le mode par défaut de
Ctrl+Alt+C et de quitter. Ce choix est indépendant de celui de l’extension. Si
le backend est arrêté, l’application le démarre toute seule.

Windows 11 range les icônes de la zone de notification dans un dépassement :
clique sur le chevron **^** à gauche de l’horloge pour voir l’icône ✓, et
fais-la glisser sur la barre des tâches pour l’y épingler.

Sous le capot : la sélection est copiée, envoyée au backend local, et le
résultat est recollé. Le presse-papiers d’origine est ensuite restauré avec
tous ses formats (texte, HTML/RTF, image et fichiers). Si l’utilisateur copie
autre chose ou change de fenêtre pendant une correction longue, le collage est
annulé afin de ne pas écraser ses nouvelles données ni viser la mauvaise
application.

```powershell
npm run app:stop               # arrête l’application
npm run autostart:install-app  # la lance à chaque ouverture de session
npm run autostart:remove-app   # l’en retire
```

## Installation de l’extension

1. Ouvre `edge://extensions` ou `chrome://extensions`.
2. Active le **Mode développeur**.
3. Clique sur **Charger l’extension décompressée**.
4. Sélectionne ce dossier.
5. Après chaque modification de l’extension, actualise-la puis recharge les pages déjà ouvertes.

Rien d’autre à lancer : le correcteur est embarqué dans l’extension.

## Utilisation

- Ouvre le popup sur un site et active **Bouton ✓ sur ce site**. Le choix est mémorisé séparément pour Gmail, Outlook, Discord et chaque autre application web.
- Clique dans un champ de texte.
- Sélectionne un passage, ou ne sélectionne rien pour corriger le champ entier.
- Clique sur le bouton violet `✓` ou utilise `Alt+Maj+C`.
- Après une modification, clique sur **Annuler** dans la notification pendant sept secondes pour restaurer le texte original.

Le bouton est masqué par défaut sur les sites qui n’ont pas été autorisés. Le raccourci clavier reste disponible même lorsque le bouton est masqué.

Dans les éditeurs riches, les corrections sont appliquées uniquement aux fragments modifiés afin de conserver le gras, l’italique et les liens. Si la structure d’une sélection ne peut pas être modifiée sûrement, l’extension demande de sélectionner un passage plus court au lieu d’aplatir le HTML.

## Mode IA facultatif

Pour débloquer les styles Pro, Amical et Concis :

```powershell
ollama pull gemma3:4b
```

Ollama et le backend doivent alors rester démarrés. L’extension détecte leur
présence toute seule et affiche les styles en conséquence ; la correction
instantanée n’en dépend jamais.

### Coût réel du mode approfondi

Ollama n’accélère que les GPU NVIDIA, AMD et Apple. Partout ailleurs - dont les
PC ARM Snapdragon X, où ni le GPU Adreno ni le NPU ne sont utilisés - le modèle
tourne **à 100 % sur le processeur** (`ollama ps` affiche `100% CPU`). Tous les
cœurs saturent pendant la génération, la machine chauffe puis se bride
d’elle-même : sur un Snapdragon X, la vitesse mesurée tombe de 27 à 19 tokens/s
une fois chaude.

Il n’existe pas de réglage qui rende cela léger : c’est le coût de quatre
milliards de paramètres traversés à chaque mot produit. Deux variables
d’environnement permettent seulement de choisir son compromis :

| Variable | Défaut | Effet |
| --- | --- | --- |
| `OLLAMA_THREADS` | tous les cœurs | Bride le nombre de cœurs. `6` sur 8 cœurs rend la machine utilisable pendant la correction, au prix d’environ 17 % de vitesse. |
| `OLLAMA_KEEP_ALIVE` | `10m` | Durée pendant laquelle le modèle reste en mémoire (~3 Go). Le rechargement coûte environ 9 s. |

```powershell
$env:OLLAMA_THREADS = "6"; npm start
```

Passer à `gemma3:1b` ne résout rien : trois fois plus rapide, il ne corrige que
ce que le mode instantané traite déjà en quelques millisecondes, et échoue sur
le réordonnancement - la seule raison d’appeler un modèle.

## Architecture

Le correcteur tourne dans l’extension. Le backend ne sert qu’aux styles de
réécriture et à l’application de bureau.

**Règles, partagées par les deux environnements**

- `grammar-rules.js` contient toute la logique de correction. C’est un script
  classique, sans import ni export : il s’exécute dans une portée où
  Grammalecte est déjà chargé et y trouve `gc_engine` comme variable globale.
  Le navigateur et Node chargent donc exactement le même fichier.

**Extension**

- `content.js` lit et remplace le texte dans la page.
- `background.js` aiguille vers le moteur embarqué ou, pour un style de
  réécriture, vers le backend s’il répond.
- `offscreen.html` héberge le Worker. Un document offscreen est nécessaire :
  le service worker MV3 s’arrête après quelques secondes et ne fournit pas
  `XMLHttpRequest`, dont Grammalecte a besoin pour lire ses données.
- `grammalecte-worker.js` charge Grammalecte par `importScripts`, puis les
  règles.
- `vendor/grammalecte/` contient le sous-ensemble embarqué (9,3 Mo) : les
  scripts du moteur et le seul dictionnaire utilisé, `fr-allvars.json`.

**Backend facultatif**

- `server.js` reçoit les demandes de réécriture et interroge Ollama.
- `grammar-engine.js` monte Grammalecte dans un contexte `vm` et y injecte
  `grammar-rules.js`.
- `.vendor/grammalecte-js/` contient la distribution Grammalecte 2.3.0
  complète, dont `vendor/grammalecte/` est extrait.

### Grammaire

Quand Grammalecte propose plusieurs pistes pour une même faute (« ce » →
« cette » ou « se »), le moteur réécrit la phrase avec chaque candidat et garde
celui qui laisse le moins d’erreurs. Prendre la première suggestion venue
dégradait le texte : « il ce lave » devenait « il cette lave », et « tu vien »
dérivait en « tu vis » de passe en passe.

Au-delà des corrections de Grammalecte, le moteur applique quelques règles
classiques à haute confiance :

- **homophones** « et » / « est » et « ou » / « où », que Grammalecte ne
  signale pas seul. La nature du mot suivant est lue dans le dictionnaire :
  « elle et partie » devient « elle est partie », tandis que « elle et Marie »
  (nom propre) et « elle et moi » (pronom) restent intacts ;

- **concordance des temps** : après un « si » hypothétique, le conditionnel
  devient imparfait (« si j’aurais su » → « si j’avais su ») ; le « si »
  interrogatif, qui admet le conditionnel, est reconnu à sa position et laissé
  intact. Réciproquement, un « si » à l’imparfait appelle le conditionnel dans
  la principale (« si j’avais su, je n’y serai pas allé » → « serais »), alors
  qu’un « si » au présent admet le futur (« si tu viens, je serai là ») ;
- **accord du participe avec le COD placé avant** l’auxiliaire « avoir » dès
  qu’un mot suit le participe, cas où Grammalecte renonce (« les décisions que
  la direction a pris la semaine dernière » → « prises »). Le genre et le nombre
  de l’antécédent viennent du dictionnaire, et la règle s’abstient dans tous les
  cas douteux : « que » conjonction (« je pense que Paul a mangé une pomme »),
  « fait » devant un infinitif, participes invariables, ou nom épicène comme
  « gens », que le français lui-même n’accorde pas de façon univoque ;
- **subjonctif** après « bien que », « quoique » et « encore que » (« bien que
  le directeur a validé » → « ait validé ») ;
- **construction verbale** : « préférer » se passe de préposition (« préféré de
  ne rien dire » → « préféré ne rien dire »), sans toucher aux locutions comme
  « de loin ».

Le réordonnancement des mots (« le train dans » → « dans le train ») et la
reformulation relèvent du mode approfondi : aucune règle déterministe ne peut
les traiter sans risquer de casser des phrases correctes.

### Langage SMS

Le moteur détecte le langage SMS par un score de marqueurs (abréviations, `k`
pour `qu`, chiffres dans les mots, verbes collés à `j’`). Quand le score est
atteint, il applique un lexique d’environ 180 abréviations courantes (`slt`,
`bcp`, `tkt`, `jsp`, `avc`, `bi1`, `2m1`, `dcp`, `chépa`, `vazy`…), des règles
contextuelles (conjugaison selon le pronom, infinitif après un semi-auxiliaire,
apostrophes élidées, `mé` → `mes`/`mais`, `ma dit` → `m’a dit`) puis repasse le
tout dans Grammalecte. Les interjections comme `mdr` ou `lol` sont laissées
telles quelles, et les textes soignés ne déclenchent jamais ce mode.

### Performances

Le port répond dès le lancement ; le moteur se charge juste derrière
(~1 s au tout premier démarrage, ~350 ms ensuite grâce au cache de
compilation V8 conservé dans `.cache/`). Une phrase courte se corrige en
quelques millisecondes et un message complet en quelques dizaines de
millisecondes. Trois caches accélèrent l’usage réel :

- **résultat complet** : re-corriger un texte inchangé est instantané ;
- **paragraphe** : dans un brouillon re-corrigé après ajout d’un passage,
  seuls les paragraphes modifiés sont réanalysés ;
- **suggestions du dictionnaire** : un mot inconnu déjà rencontré ne relance
  pas la recherche dans le graphe.

Le backend écoute uniquement sur `127.0.0.1:8787`. Aucun texte n’est enregistré ou envoyé sur Internet.

## Vérification

```powershell
npm run check
```

## Composant tiers

Grammalecte 2.3.0 est un correcteur grammatical français distribué sous GPL-3.0. Le code et les fichiers de licence officiels sont conservés dans `.vendor/grammalecte-js`.

Site officiel : <https://www.grammalecte.net/>
