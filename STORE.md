# Textes de publication - Korr

Contenus prêts à coller dans les formulaires des boutiques et sur Product Hunt.

---

## Nom

```
Korr - correcteur français
```

## Description courte (132 caractères max)

```
Corrigez le français dans n'importe quel champ de saisie. Gratuit, sans compte, et 100 % hors ligne : rien ne quitte votre PC.
```

## Description longue

```
Korr corrige vos fautes de français directement là où vous écrivez :
e-mail, réseau social, messagerie, outil de travail.

Sélectionnez du texte, appuyez sur le bouton ✓ ou sur Alt+Maj+C, c'est corrigé.

━━━ 100 % HORS LIGNE ━━━

Le correcteur est embarqué dans l'extension. Votre texte n'est jamais envoyé
sur Internet : pas de serveur, pas de compte, pas de traceur, pas de
publicité. Aucune inscription, aucune limite d'utilisation.

━━━ CE QU'IL CORRIGE ━━━

• Orthographe, grammaire, conjugaison
• Accords difficiles : participe passé avec le COD placé avant l'auxiliaire,
  verbes pronominaux, accords à distance
• Concordance des temps : « si j'aurais su » → « si j'avais su »
• Subjonctif après « bien que », « quoique »
• Homophones : et/est, ou/où, sa/ça, quand/quant
• Barbarismes : « pallier aux » → « pallier les », « croivent » → « croient »
• Typographie française : espace insécable avant ! ? : ;
• Langage SMS : environ 180 abréviations (slt, bcp, tkt, jsp, bi1, 2m1…)

━━━ RAPIDE ━━━

Une correction prend quelques millisecondes. Le moteur se charge en moins
d'une seconde au démarrage du navigateur, puis reste prêt.

━━━ RESPECTUEUX DE VOTRE TEXTE ━━━

Le bouton reste masqué par défaut : il n'apparaît que sur les sites que vous
activez explicitement, un par un. Dans les éditeurs riches, seuls les
fragments modifiés sont remplacés, ce qui préserve gras, italique et liens.
Un bouton « Annuler » permet de revenir en arrière pendant sept secondes.

Quand une correction est incertaine, l'extension préfère ne rien faire plutôt
que de dégrader votre texte.

━━━ LIBRE ET VÉRIFIABLE ━━━

Logiciel libre sous licence GNU GPL 3.0. Le code est public : chacun peut
vérifier qu'aucune donnée ne sort de la machine.

Propulsé par Grammalecte 2.3.0, le correcteur grammatical français libre.
```

## Justification des permissions (formulaire de review)

**storage**
```
Mémorise uniquement les réglages de l'utilisateur : la liste des sites où il a
activé le bouton, et le style de réponse choisi. Aucune donnée personnelle.
```

**activeTab**
```
Permet de lire et remplacer le texte de l'onglet actif au moment précis où
l'utilisateur déclenche une correction.
```

**offscreen**
```
Le correcteur Grammalecte s'exécute dans un Web Worker qui nécessite
XMLHttpRequest pour charger son dictionnaire. Le service worker MV3 ne fournit
pas cette API et s'arrête après quelques secondes ; un document offscreen est
donc le seul emplacement possible pour héberger le moteur.
```

**host_permissions `<all_urls>` (content script)**
```
La correction doit fonctionner dans le champ de saisie où l'utilisateur écrit,
quel que soit le site. Le bouton reste masqué par défaut et n'apparaît que sur
les sites explicitement activés par l'utilisateur. Aucun contenu de page n'est
lu, transmis ou stocké tant qu'une correction n'est pas demandée, et rien
n'est jamais envoyé sur le réseau.
```

**optional_host_permissions `http://127.0.0.1:8787/*`**
```
Facultatif. Permet à l'extension de dialoguer avec un service local que
l'utilisateur installe lui-même pour activer les styles de réécriture par IA.
L'adresse est la machine de l'utilisateur : aucune donnée ne sort de son
ordinateur. Sans cette permission, l'extension fonctionne normalement.
```

## Politique de confidentialité

Hébergez `PRIVACY.md` sur GitHub Pages ou renseignez l'URL du fichier dans le
dépôt, par exemple :

```
https://github.com/<utilisateur>/korr/blob/main/PRIVACY.md
```

---

# Product Hunt

## Tagline (60 caractères max)

```
Offline French grammar checker for any text field
```

## Description

```
Korr fixes French grammar wherever you type - Gmail, Slack, Notion,
anywhere - without sending a single character to the cloud.

The whole correction engine ships inside the extension. No account, no server,
no tracking, no limits, no subscription. It works on a plane.

It handles what French learners and natives actually get wrong: past participle
agreement with a preceding direct object, pronominal verbs, subjunctive after
"bien que", the "si j'aurais" trap, et/est and ou/où homophones, and the
non-breaking space French typography requires before ! ? : ;

It also expands SMS shorthand - about 180 abbreviations.

Corrections take milliseconds. When a fix is uncertain, it does nothing rather
than degrade your text.

Free software under GPL-3.0, built on Grammalecte. The code is public, so the
privacy claim is verifiable rather than promised.
```

## Premier commentaire (à poster soi-même au lancement)

```
Salut Product Hunt 👋

J'ai construit Korr parce que les correcteurs existants envoient tous
votre texte sur leurs serveurs, exigent un compte, et limitent l'usage gratuit.

Le pari : tout faire tourner en local. Le moteur (Grammalecte, libre) est
embarqué dans l'extension - aucune requête réseau, vérifiable puisque le code
est public.

Le plus dur n'a pas été de corriger, mais de savoir NE PAS corriger. Un
correcteur qui dégrade votre texte est pire qu'aucun correcteur. Chaque règle
est accompagnée de contre-exemples : « elle et Marie » ne doit pas devenir
« elle est Marie », « je me demande si j'aurais dû » garde son conditionnel.
Il y a aujourd'hui plus de 150 cas de test, dont une bonne moitié vérifie que
l'outil laisse le texte tranquille.

Heureux de répondre à vos questions !
```
