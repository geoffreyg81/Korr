# Politique de confidentialité - Korr

_Dernière mise à jour : 18 juillet 2026_

## En une phrase

Korr ne collecte, ne transmet et ne stocke aucune donnée personnelle.
Le texte que vous corrigez ne quitte jamais votre ordinateur.

## Quelles données sont traitées

Lorsque vous déclenchez une correction, l'extension lit le texte du champ de
saisie actif ou de votre sélection. Ce texte est envoyé au correcteur
**embarqué dans l'extension**, qui s'exécute entièrement dans votre navigateur.
Le résultat remplace le texte d'origine.

Ce traitement est **local et éphémère** : le texte n'est écrit sur aucun
disque, conservé dans aucune base, et transmis à aucun serveur.

## Ce qui est enregistré sur votre appareil

L'extension utilise le stockage local du navigateur (`chrome.storage.local`)
pour retenir uniquement vos réglages :

- la liste des sites où vous avez activé le bouton de correction ;
- le style de réponse choisi.

Ces informations restent sur votre appareil et sont supprimées avec
l'extension.

## Aucune transmission réseau

L'extension n'effectue aucune requête vers Internet. Il n'y a ni serveur, ni
compte, ni analyse d'audience, ni traceur, ni publicité, ni identifiant
publicitaire, ni télémétrie.

La seule connexion possible est **facultative** et vise exclusivement
`http://127.0.0.1:8787`, c'est-à-dire votre propre ordinateur : elle sert au
mode de réécriture par IA, qui exige que vous installiez et lanciez vous-même
un service local. Cette permission est optionnelle ; sans elle, l'extension
fonctionne normalement. Même dans ce mode, le texte ne sort pas de votre
machine.

## Pourquoi l'extension demande l'accès à tous les sites

La correction doit pouvoir s'effectuer dans le champ où vous écrivez, quel
qu'il soit : messagerie, réseau social, outil professionnel. C'est la raison
de l'autorisation `<all_urls>`.

Le bouton reste **masqué par défaut** : il n'apparaît que sur les sites que
vous activez explicitement, un par un, depuis le menu de l'extension. Aucun
contenu de page n'est lu tant que vous ne demandez pas une correction.

## Vos droits

Aucune donnée personnelle n'étant collectée, il n'y a rien à consulter,
rectifier ou effacer auprès de nous. Vos réglages locaux disparaissent lorsque
vous désinstallez l'extension.

## Code source

Korr est un logiciel libre publié sous licence GNU GPL 3.0. Le code
est public et vérifiable : chacun peut confirmer les affirmations de cette
politique en le lisant.

## Contact

Pour toute question : g.giner81@gmail.com
