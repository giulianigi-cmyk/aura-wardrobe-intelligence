import type { GuideText } from "./guide-structure";

const text: GuideText = {
  title: "Guide d'AURA",
  intro: "Comment utiliser chaque partie de l'app, étape par étape. À côté de chaque étape, vous voyez le bouton à toucher tel qu'il apparaît dans l'app ; « Ouvrir » vous y emmène directement.",
  searchPlaceholder: "Rechercher dans le guide…",
  noResults: "Aucun sujet trouvé. Essayez un autre mot.",
  open: "Ouvrir",
  replayTour: "Revoir la visite de l'app",
  chapters: {
    start: "Premiers pas",
    wardrobe: "Votre garde-robe",
    outfits: "Tenues et Styliste",
    calendar: "Calendrier et voyages",
    avatar: "Avatar et essayage virtuel",
    "colors-shopping": "Couleurs, achats et statistiques",
    community: "Communauté",
    account: "Compte et paramètres",
  },
  articles: {
    about: {
      title: "Comment AURA est organisée",
      intro: "AURA est votre garde-robe numérique : vous photographiez vos pièces et l'app vous propose quoi porter, chaque jour. Cinq sections sont toujours en bas de l'écran.",
      steps: [
        "Accueil : le look du jour, pensé pour la météo, et les raccourcis.",
        "Garde-robe : toutes vos pièces et le bouton + pour en ajouter.",
        "Styliste : créer des tenues, demander conseil et retrouver vos looks.",
        "Calendrier : quoi porter jour après jour, vos rendez-vous et vos voyages.",
        "Vous : profil, avatar, analyse des couleurs, statistiques et Paramètres.",
      ],
    },
    "first-pieces": {
      title: "Ajouter vos premières pièces",
      intro: "Le plus rapide est d'envoyer plusieurs photos à la fois. Commencez par les pièces que vous portez le plus.",
      steps: [
        "Sur l'Accueil, dans l'encadré Premiers pas, touchez « Plusieurs photos ».",
        "Touchez « Choisir des photos » et sélectionnez jusqu'à 50 photos dans la galerie, une par pièce.",
        "AURA détoure et reconnaît les pièces en arrière-plan : vous pouvez continuer à utiliser l'app ou la fermer.",
        "Quand le lot est prêt, touchez « Examiner », vérifiez les pièces et ajoutez-les à la garde-robe.",
      ],
      tip: "Des photos de la pièce entière sur un fond simple donnent les meilleurs résultats.",
    },
    "first-look": {
      title: "Votre premier look",
      steps: [
        "Avec au moins 3 pièces, La sélection du jour apparaît sur l'Accueil : votre look du jour.",
        "Touchez « Composer un look » pour en faire créer un autre dans la section Styliste.",
        "À partir de 10 pièces arrivent aussi les tenues de la semaine et des voyages.",
      ],
    },
    "add-one": {
      title: "Ajouter une pièce",
      steps: [
        "Ouvrez Garde-robe.",
        "Touchez le bouton + en haut.",
        "Choisissez « Ajouter une pièce ».",
        "Prenez une photo ou choisissez-en une dans la galerie.",
        "AURA retire le fond et remplit type, couleurs, matières et saison : vérifiez et corrigez si besoin.",
        "Touchez « Enregistrer dans la garde-robe ».",
      ],
      tip: "Le prix et la date d'achat sont facultatifs, mais ils servent au coût par port dans les statistiques.",
    },
    "add-link": {
      title: "Ajouter une pièce depuis un lien",
      intro: "Achetée en ligne ? Vous pouvez utiliser la page du produit au lieu d'une photo.",
      steps: [
        "Dans Garde-robe, touchez + puis « Ajouter une pièce ».",
        "Touchez « Coller le lien du produit ».",
        "Collez le lien dans le champ (appui long puis Coller) ou touchez « Coller depuis le presse-papiers ».",
        "Touchez « Importer le produit » : AURA récupère la photo, la marque et le prix sur la page. Vérifiez et enregistrez.",
      ],
    },
    batch: {
      title: "Ajouter beaucoup de pièces à la fois",
      steps: [
        "Dans Garde-robe, touchez +.",
        "Choisissez « Scanner des photos en lot ».",
        "Choisissez jusqu'à 50 photos dans la galerie, ou collez des liens de produits.",
        "Les photos sont traitées en arrière-plan : vous pouvez fermer l'app et vous trouverez un avis dans les notifications quand c'est prêt.",
        "Touchez « Examiner », choisissez les pièces à garder et ajoutez-les à la garde-robe.",
      ],
      tip: "Si le service n'est pas disponible, AURA vous l'indique sous le lot : réessayez plus tard.",
    },
    "outfit-scan": {
      title: "Photographier une tenue entière",
      intro: "Une photo de vous avec la tenue : AURA reconnaît toutes les pièces à la fois.",
      steps: [
        "Dans Garde-robe, touchez +.",
        "Choisissez « Scanner une tenue » et prenez ou choisissez une photo en pied.",
        "Vérifiez les pièces trouvées : celles déjà dans votre garde-robe sont associées, les nouvelles peuvent être ajoutées.",
        "Si vous l'avez portée aujourd'hui, touchez « Oui, enregistrer comme porté ».",
      ],
    },
    find: {
      title: "Trouver une pièce",
      steps: [
        "Ouvrez Garde-robe.",
        "Choisissez de voir seulement les pièces de cette saison ou toutes les saisons.",
        "Utilisez la recherche et les catégories en haut pour affiner la liste.",
      ],
    },
    "item-card": {
      title: "La fiche d'une pièce",
      steps: [
        "Dans Garde-robe, touchez une pièce pour ouvrir sa fiche.",
        "De là, vous pouvez modifier les détails, retirer le fond ou ajuster le recadrage de la photo.",
        "« Créer une tenue à partir de ceci » vous propose des looks construits autour de cette pièce.",
        "Vous pouvez la marquer comme prêtée, l'archiver si vous ne la portez plus, ou la supprimer.",
      ],
    },
    locations: {
      title: "Plusieurs garde-robes (maison, mer, ville…)",
      intro: "Si vous rangez vos vêtements à différents endroits, AURA peut ne vous proposer que ce que vous avez sous la main.",
      steps: [
        "Ouvrez Vous.",
        "Touchez l'engrenage pour ouvrir les Paramètres.",
        "Touchez « Emplacements de la garde-robe » et créez vos lieux.",
      ],
    },
    today: {
      title: "Le look du jour",
      steps: [
        "Sur l'Accueil, vous trouvez La sélection du jour, choisie parmi vos pièces.",
        "Touchez « Utiliser la position » ou saisissez votre ville : le look tiendra compte de la météo.",
        "Les looks tiennent aussi compte de vos rendez-vous si vous connectez votre calendrier.",
      ],
    },
    canvas: {
      title: "Créer une tenue vous-même",
      steps: [
        "Ouvrez Styliste.",
        "Touchez « Créer manuellement » : la toile s'ouvre.",
        "Touchez « Ajouter depuis la garde-robe » et choisissez les pièces.",
        "Déplacez, agrandissez et superposez les pièces avec les doigts.",
        "Touchez « Enregistrer la tenue ». Vous pouvez aussi la partager ou l'ajouter au calendrier.",
      ],
    },
    "ask-stylist": {
      title: "Demander au styliste",
      intro: "Écrivez ou parlez comme à une personne : « que porter pour un mariage dans un jardin en juin ? ».",
      steps: [
        "Ouvrez Styliste.",
        "Touchez « Demander à votre styliste ».",
        "Écrivez votre question, ou touchez le micro, parlez et touchez-le à nouveau pour terminer.",
        "Le look proposé utilise vos pièces : vous pouvez l'enregistrer sur la toile ou l'ajouter au calendrier.",
      ],
    },
    "ai-suggest": {
      title: "Une tenue pour une occasion",
      steps: [
        "Ouvrez Styliste et faites défiler jusqu'à « Plus d'options ».",
        "Choisissez l'occasion.",
        "Touchez « Suggestion IA » : AURA compose une tenue avec vos pièces.",
      ],
    },
    "work-week": {
      title: "Les tenues de travail de la semaine",
      steps: [
        "Ouvrez Styliste.",
        "Touchez « Créer des tenues de travail ».",
        "Choisissez la période et la garde-robe à utiliser, puis touchez « Générer ».",
        "Les jours travaillés et le code vestimentaire se règlent dans Paramètres › Préférences de style.",
      ],
    },
    "my-outfits": {
      title: "Vos tenues",
      steps: [
        "Ouvrez Styliste et faites défiler jusqu'à Mes tenues.",
        "À venir : les looks planifiés. Portées : ce que vous avez porté. Ma Tenue : vos photos. Enregistrées et Archives : les looks que vous avez gardés.",
        "Sur chaque tenue, vous pouvez la partager, la dupliquer, l'archiver ou la supprimer.",
      ],
    },
    worn: {
      title: "Noter ce que vous avez porté",
      intro: "Ainsi AURA sait ce que vous portez vraiment : les suggestions s'améliorent et le coût par port est calculé.",
      steps: [
        "Quand AURA demande « Avez-vous porté cette tenue ? », touchez « Oui, c'est ce que j'ai porté ».",
        "Ou, dans Calendrier, ouvrez le jour et touchez « Marquer comme portée ».",
        "Ou prenez-vous en photo avec « Scanner une tenue ».",
      ],
    },
    "plan-day": {
      title: "Planifier une journée",
      steps: [
        "Ouvrez Calendrier.",
        "Touchez un jour de la semaine ou du mois.",
        "Planifiez une tenue, demandez au styliste ou choisissez vous-même les pièces.",
        "En fin de journée, vous pouvez la marquer comme portée.",
      ],
    },
    "connect-calendar": {
      title: "Connecter votre calendrier",
      intro: "Avec vos rendez-vous, AURA propose la bonne tenue pour chacun.",
      steps: [
        "Ouvrez Vous.",
        "Touchez l'engrenage pour ouvrir les Paramètres.",
        "Touchez « Calendrier ».",
        "Connectez Google, Outlook ou iCloud. Pour iCloud, il faut un mot de passe pour app, créé sur appleid.apple.com.",
      ],
      tip: "AURA lit seulement vos événements et ne les modifie jamais. Les identifiants sont enregistrés chiffrés.",
    },
    trips: {
      title: "Préparer un voyage",
      steps: [
        "Ouvrez Calendrier.",
        "Touchez la valise en haut.",
        "Touchez « Planifier un voyage ».",
        "Indiquez la destination (vous pouvez ajouter des étapes), les dates, le type de voyage et la garde-robe où prendre les pièces.",
        "AURA prépare la liste pour la valise et les tenues de chaque jour, selon les prévisions météo.",
      ],
    },
    "create-avatar": {
      title: "Créer votre avatar",
      intro: "L'avatar est une photo de vous en pied : il permet de voir les tenues portées par vous.",
      steps: [
        "Ouvrez Vous.",
        "Touchez « Mon avatar ».",
        "Touchez « Ajoutez votre photo » : debout, de face, en pied, avec une bonne lumière.",
        "Lisez et acceptez l'utilisation de la photo. Vous pourrez ensuite l'agrandir et la centrer, la changer ou la supprimer à tout moment.",
      ],
    },
    "try-on": {
      title: "Essayer une tenue sur l'avatar",
      steps: [
        "Sur une tenue, touchez « Essayer sur mon avatar », ou choisissez vous-même les pièces.",
        "Touchez « Générer » et patientez quelques secondes.",
        "Enregistrez le résultat dans vos tenues ou générez-le à nouveau.",
        "Le nombre d'essayages dépend de votre forfait : voir Paramètres › Forfait et utilisation.",
      ],
    },
    "color-analysis": {
      title: "Analyse des couleurs",
      steps: [
        "Ouvrez Vous.",
        "Touchez « Analyse des couleurs ».",
        "Prenez une photo de votre visage à la lumière naturelle. Elle est analysée sur le téléphone et n'est jamais enregistrée.",
        "Touchez « Enregistrer dans le profil » : AURA utilisera votre palette pour les associations.",
      ],
    },
    "color-lab": {
      title: "Harmonie des couleurs",
      steps: [
        "Ouvrez l'Accueil.",
        "Touchez Laboratoire couleurs.",
        "Choisissez une pièce et découvrez avec quelles couleurs de votre garde-robe elle s'accorde.",
      ],
    },
    shop: {
      title: "Quoi acheter (et quoi éviter)",
      steps: [
        "Ouvrez l'Accueil.",
        "Touchez « Compléter votre garde-robe » : AURA vous dit quelles pièces vous manquent vraiment et avec combien des vôtres elles s'associeraient.",
        "Sur le point d'acheter ? Touchez « Devrais-je l'acheter ? » et collez le lien ou envoyez une photo : AURA le compare avec ce que vous avez déjà.",
      ],
    },
    insights: {
      title: "Statistiques de la garde-robe",
      steps: [
        "Ouvrez Vous.",
        "Touchez « Analyse de la garde-robe ».",
        "Voyez la valeur de votre garde-robe, le coût par port et les pièces jamais portées. Vous pouvez aussi y accéder depuis le taux d'utilisation sur l'Accueil.",
      ],
    },
    friends: {
      title: "Amis et partage",
      steps: [
        "Ouvrez Vous.",
        "Touchez « Communauté » et choisissez votre nom d'utilisateur.",
        "Montrez votre code QR pour que vos amis vous ajoutent.",
        "Partagez une tenue avec le bouton de partage : envoyez-la en message ou publiez-la dans le Feed.",
        "« Inviter des amis » envoie le lien pour télécharger AURA.",
      ],
    },
    "profile-settings": {
      title: "Profil, tailles et préférences",
      intro: "Plus AURA en sait sur vous, plus les suggestions sont justes.",
      steps: [
        "Depuis Vous, touchez l'engrenage pour ouvrir les Paramètres.",
        "Informations personnelles : nom, date de naissance, travail.",
        "Mes tailles : vos tailles de vêtements et de chaussures.",
        "Préférences de style : code vestimentaire au travail, formalité et jours travaillés.",
        "Préférences vestimentaires : ce que vous préférez éviter (épaules dénudées, jupes courtes, talons hauts…).",
        "Langue : italien, anglais, espagnol ou français.",
      ],
    },
    "notifications-privacy": {
      title: "Notifications et confidentialité",
      steps: [
        "Notifications : choisissez les alertes à recevoir, par exemple quand la météo change pour une tenue planifiée.",
        "Confidentialité : décidez de partager ou non vos pièces dans la bibliothèque commune, de façon anonyme.",
      ],
    },
    plan: {
      title: "Forfait et utilisation",
      steps: [
        "Dans les Paramètres, touchez « Forfait et utilisation ».",
        "Voyez votre forfait et votre utilisation du jour et du mois pour les fonctions limitées.",
      ],
    },
    problem: {
      title: "Signaler un problème",
      steps: [
        "Dans les Paramètres, touchez « Signaler un problème ».",
        "Décrivez ce qui s'est passé et où : nous le lisons et le corrigeons.",
      ],
    },
    "delete-account": {
      title: "Supprimer le compte",
      steps: [
        "En bas des Paramètres, touchez « Supprimer le compte ».",
        "Confirmez : le compte, les pièces, les tenues, les photos et l'avatar sont supprimés définitivement.",
      ],
    },
  },
};

export default text;
