import type { GuideText } from "./guide-structure";

const text: GuideText = {
  title: "Guía de AURA",
  intro: "Cómo usar cada parte de la app, paso a paso. Junto a cada paso ves el botón que hay que tocar, tal como aparece en la app; con «Abrir» vas directamente.",
  searchPlaceholder: "Buscar en la guía…",
  noResults: "No se ha encontrado ningún tema. Prueba con otra palabra.",
  open: "Abrir",
  replayTour: "Volver a ver el recorrido de la app",
  chapters: {
    start: "Primeros pasos",
    wardrobe: "Tu armario",
    outfits: "Outfits y Estilista",
    calendar: "Calendario y viajes",
    avatar: "Avatar y prueba virtual",
    "colors-shopping": "Colores, compras y estadísticas",
    community: "Comunidad",
    account: "Cuenta y ajustes",
  },
  articles: {
    about: {
      title: "Cómo está organizada AURA",
      intro: "AURA es tu armario digital: fotografías tus prendas y la app te propone qué ponerte, cada día. Abajo siempre hay cinco secciones.",
      steps: [
        "Inicio: el look de hoy, pensado para el tiempo, y los atajos.",
        "Armario: todas tus prendas y el botón + para añadir más.",
        "Estilista: crear outfits, pedir consejo y encontrar tus looks.",
        "Calendario: qué ponerte cada día, tus planes y viajes.",
        "Tú: perfil, avatar, análisis de color, estadísticas y Ajustes.",
      ],
    },
    "first-pieces": {
      title: "Añadir tus primeras prendas",
      intro: "Lo más rápido es subir varias fotos a la vez. Empieza por las prendas que más usas.",
      steps: [
        "En Inicio, en el recuadro Primeros pasos, toca «Varias fotos».",
        "Toca «Elegir fotos» y selecciona de la galería hasta 50 fotos, una por prenda.",
        "AURA quita el fondo y reconoce las prendas en segundo plano: puedes seguir usando la app o cerrarla.",
        "Cuando el lote esté listo, toca «Revisar», comprueba las prendas y añádelas al armario.",
      ],
      tip: "Las fotos de la prenda entera sobre un fondo sencillo dan los mejores resultados.",
    },
    "first-look": {
      title: "Tu primer look",
      steps: [
        "Con al menos 3 prendas, en Inicio aparece La selección de hoy: tu look del día.",
        "Toca «Crear un look» para que se cree otro en la sección Estilista.",
        "Con 10 prendas o más llegan también los outfits de la semana y de los viajes.",
      ],
    },
    "add-one": {
      title: "Añadir una prenda",
      steps: [
        "Abre Armario.",
        "Toca el botón + de arriba.",
        "Elige «Añadir una prenda».",
        "Haz una foto o elige una de la galería.",
        "AURA quita el fondo y rellena tipo, colores, materiales y temporada: revisa y corrige si hace falta.",
        "Toca «Guardar en el armario».",
      ],
      tip: "El precio y la fecha de compra son opcionales, pero sirven para el coste por uso en las estadísticas.",
    },
    "add-link": {
      title: "Añadir una prenda desde un enlace",
      intro: "¿La compraste online? Puedes usar la página del producto en lugar de una foto.",
      steps: [
        "En Armario toca + y luego «Añadir una prenda».",
        "Toca «Pegar enlace del producto».",
        "Pega el enlace en el campo (mantén pulsado y elige Pegar) o toca «Pegar desde el portapapeles».",
        "Toca «Importar producto»: AURA toma la foto, la marca y el precio de la página. Revisa y guarda.",
      ],
    },
    batch: {
      title: "Añadir muchas prendas a la vez",
      steps: [
        "En Armario toca +.",
        "Elige «Escaneo por lotes».",
        "Elige hasta 50 fotos de la galería o pega enlaces de productos.",
        "Las fotos se procesan en segundo plano: puedes cerrar la app y encontrarás un aviso en las notificaciones cuando esté listo.",
        "Toca «Revisar», elige las prendas que quieres conservar y añádelas al armario.",
      ],
      tip: "Si el servicio no está disponible, AURA te lo indica debajo del lote: inténtalo más tarde.",
    },
    "outfit-scan": {
      title: "Fotografiar un outfit completo",
      intro: "Una foto tuya con el outfit puesto: AURA reconoce todas las prendas a la vez.",
      steps: [
        "En Armario toca +.",
        "Elige «Escanear un look» y haz o elige una foto de cuerpo entero.",
        "Revisa las prendas encontradas: las que ya están en tu armario se emparejan y las nuevas puedes añadirlas.",
        "Si lo has llevado hoy, toca «Sí, registrar como usado».",
      ],
    },
    find: {
      title: "Encontrar una prenda",
      steps: [
        "Abre Armario.",
        "Elige si ver solo las prendas de esta temporada o de todas.",
        "Usa la búsqueda y las categorías de arriba para acotar la lista.",
      ],
    },
    "item-card": {
      title: "La ficha de una prenda",
      steps: [
        "En Armario toca una prenda para abrir su ficha.",
        "Desde aquí puedes editar los detalles, quitar el fondo o ajustar el recorte de la foto.",
        "«Crear outfit a partir de esto» te propone looks pensados alrededor de esa prenda.",
        "Puedes marcarla como prestada, archivarla si ya no la usas o eliminarla.",
      ],
    },
    locations: {
      title: "Varios armarios (casa, playa, ciudad…)",
      intro: "Si guardas la ropa en sitios distintos, AURA puede proponerte solo lo que tienes a mano.",
      steps: [
        "Abre Tú.",
        "Toca el engranaje para abrir Ajustes.",
        "Toca «Ubicaciones del armario» y crea tus lugares.",
      ],
    },
    today: {
      title: "El look de hoy",
      steps: [
        "En Inicio encuentras La selección de hoy, elegida entre tus prendas.",
        "Toca «Usar ubicación» o escribe tu ciudad: el look tendrá en cuenta el tiempo.",
        "Los looks también tienen en cuenta tus planes si conectas el calendario.",
      ],
    },
    canvas: {
      title: "Crear un outfit por tu cuenta",
      steps: [
        "Abre Estilista.",
        "Toca «Crear manualmente»: se abre el lienzo.",
        "Toca «Añadir del armario» y elige las prendas.",
        "Mueve, amplía y superpone las prendas con los dedos.",
        "Toca «Guardar outfit». También puedes compartirlo o ponerlo en el calendario.",
      ],
    },
    "ask-stylist": {
      title: "Preguntar al estilista",
      intro: "Escribe o habla como lo harías con una persona: «¿qué me pongo para una boda en un jardín en junio?».",
      steps: [
        "Abre Estilista.",
        "Toca «Pregunta a tu estilista».",
        "Escribe la pregunta, o toca el micrófono, habla y vuelve a tocarlo para terminar.",
        "El look propuesto usa tus prendas: puedes guardarlo en el lienzo o añadirlo al calendario.",
      ],
    },
    "ai-suggest": {
      title: "Un outfit para una ocasión",
      steps: [
        "Abre Estilista y baja hasta «Más opciones».",
        "Elige la ocasión.",
        "Toca «Sugerencia de IA»: AURA compone un outfit con tus prendas.",
      ],
    },
    "work-week": {
      title: "Los outfits de trabajo de la semana",
      steps: [
        "Abre Estilista.",
        "Toca «Crear outfits de trabajo».",
        "Elige el periodo y el armario que quieres usar, y toca «Generar».",
        "Los días laborables y el código de vestimenta se configuran en Ajustes › Preferencias de estilo.",
      ],
    },
    "my-outfits": {
      title: "Tus outfits",
      steps: [
        "Abre Estilista y baja hasta Mis outfits.",
        "Próximos: los looks planificados. Usados: los que te has puesto. Mi Outfit: tus fotos. Guardados y Archivo: los looks que has conservado.",
        "En cada outfit puedes compartirlo, duplicarlo, archivarlo o eliminarlo.",
      ],
    },
    worn: {
      title: "Registrar lo que llevaste",
      intro: "Así AURA sabe qué usas de verdad: mejora las sugerencias y calcula el coste por uso.",
      steps: [
        "Cuando AURA te pregunte «¿Usaste esto?», toca «Sí, esto es lo que llevé puesto».",
        "O en Calendario abre el día y toca «Marcar como usado».",
        "O hazte una foto con «Escanear un look».",
      ],
    },
    "plan-day": {
      title: "Planificar un día",
      steps: [
        "Abre Calendario.",
        "Toca un día de la semana o del mes.",
        "Planifica un outfit, pregunta al estilista o elige tú las prendas.",
        "Al final del día puedes marcarlo como usado.",
      ],
    },
    "connect-calendar": {
      title: "Conectar tu calendario",
      intro: "Con tus planes, AURA propone el outfit adecuado para cada cita.",
      steps: [
        "Abre Tú.",
        "Toca el engranaje para abrir Ajustes.",
        "Toca «Calendario».",
        "Conecta Google, Outlook o iCloud. Para iCloud necesitas una contraseña específica para apps, creada en appleid.apple.com.",
      ],
      tip: "AURA solo lee tus eventos y nunca los modifica: los actualiza sola dos veces al día, y puedes sincronizarlos cuando quieras. Las credenciales se guardan cifradas.",
    },
    trips: {
      title: "Preparar un viaje",
      steps: [
        "Abre Calendario.",
        "Toca la maleta de arriba.",
        "Toca «Planificar un viaje».",
        "Escribe el destino (puedes añadir paradas), las fechas, el tipo de viaje y de qué armario coger las prendas.",
        "AURA prepara la lista para la maleta y los outfits de cada día, según la previsión del tiempo.",
      ],
    },
    "create-avatar": {
      title: "Crear tu avatar",
      intro: "El avatar es una foto tuya de cuerpo entero: sirve para ver los outfits puestos en ti.",
      steps: [
        "Abre Tú.",
        "Toca «Mi avatar».",
        "Toca «Añade tu foto»: de pie, de frente, de cuerpo entero y con buena luz.",
        "Lee y acepta el uso de la foto. Después puedes ampliarla y centrarla, cambiarla o eliminarla cuando quieras.",
      ],
    },
    "try-on": {
      title: "Probar un outfit en el avatar",
      steps: [
        "En un outfit toca «Probar en mi avatar», o elige tú las prendas.",
        "Toca «Generar» y espera unos segundos.",
        "Guarda el resultado en tus outfits o vuelve a generarlo.",
        "Las pruebas disponibles dependen de tu plan: las ves en Ajustes › Plan y uso.",
      ],
    },
    "color-analysis": {
      title: "Análisis de color",
      steps: [
        "Abre Tú.",
        "Toca «Análisis de color».",
        "Hazte una foto de la cara con luz natural. Se analiza en el teléfono y no se guarda.",
        "Toca «Guardar en el perfil»: AURA usará tu paleta en las combinaciones.",
      ],
    },
    "color-lab": {
      title: "Armonía de colores",
      steps: [
        "Abre Inicio.",
        "Toca Color Lab.",
        "Elige una prenda y descubre con qué colores de tu armario combina.",
      ],
    },
    shop: {
      title: "Qué comprar (y qué no)",
      steps: [
        "Abre Inicio.",
        "Toca «Completa tu armario»: AURA te dice qué prendas te faltan de verdad y con cuántas de las tuyas combinarían.",
        "¿Vas a comprar algo? Toca «¿Debería comprarlo?» y pega el enlace o sube una foto: AURA lo compara con lo que ya tienes.",
      ],
    },
    insights: {
      title: "Estadísticas del armario",
      steps: [
        "Abre Tú.",
        "Toca «Estadísticas del armario».",
        "Ve el valor del armario, el coste por uso y las prendas que nunca te has puesto. También puedes llegar desde la tasa de uso en Inicio.",
      ],
    },
    friends: {
      title: "Amigos y compartir",
      steps: [
        "Abre Tú.",
        "Toca «Comunidad» y elige tu nombre de usuario.",
        "Muestra tu código QR para que tus amigos te añadan.",
        "Comparte un outfit con el botón de compartir: puedes enviarlo por chat o publicarlo en el Feed.",
        "Con «Invitar amigos» envías el enlace para descargar AURA.",
      ],
    },
    "profile-settings": {
      title: "Perfil, tallas y preferencias",
      intro: "Cuanto más sepa AURA de ti, mejores serán las sugerencias.",
      steps: [
        "Desde Tú, toca el engranaje para abrir Ajustes.",
        "Datos personales: nombre, fecha de nacimiento, trabajo.",
        "Mis tallas: tus tallas de ropa y calzado.",
        "Preferencias de estilo: código de vestimenta en el trabajo, formalidad y días laborables.",
        "Preferencias de vestimenta: lo que prefieres evitar (hombros al aire, faldas cortas, tacones altos…).",
        "Idioma: italiano, inglés, español o francés.",
      ],
    },
    "notifications-privacy": {
      title: "Notificaciones y privacidad",
      steps: [
        "Notificaciones: elige qué avisos recibir, por ejemplo cuando cambia el tiempo para un outfit planificado.",
        "Privacidad: decide si compartir tus prendas en la biblioteca común, de forma anónima.",
      ],
    },
    plan: {
      title: "Plan y uso",
      steps: [
        "En Ajustes toca «Plan y uso».",
        "Ve tu plan y cuánto has usado hoy y este mes de las funciones con límite.",
      ],
    },
    problem: {
      title: "Informar de un problema",
      steps: [
        "En Ajustes toca «Informar de un problema».",
        "Describe qué ha pasado y dónde: lo leemos y lo solucionamos.",
      ],
    },
    "delete-account": {
      title: "Eliminar la cuenta",
      steps: [
        "Al final de Ajustes toca «Eliminar cuenta».",
        "Confirma: se eliminan para siempre la cuenta, las prendas, los outfits, las fotos y el avatar.",
      ],
    },
  },
};

export default text;
