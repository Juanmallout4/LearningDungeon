import { Tul } from '../types';

// Catálogo completo de Tuls (patrones/formas) de Taekwondo ITF, ordenado de menor a mayor exigencia.
// Cada entrada sigue la misma estructura:
//  - id/name: identificador interno y nombre del Tul
//  - rankRequirement/beltName: nivel de cinturón mínimo requerido y su nombre para mostrar
//  - meaning/beltMeaning/description/diagramDetails: textos traducidos a los 6 idiomas soportados (es, en, fr, de, it, pt)
//    que explican el significado del Tul, el significado del cinturón, un resumen (nº de movimientos y diagrama)
//    y detalles de cómo se ejecuta el diagrama
//  - moves: número total de movimientos del patrón
//  - diagramType: forma geométrica del diagrama que traza el Tul (usado por TulDiagram para dibujarlo)
//  - videoId: id del vídeo de YouTube de referencia para visualizar la ejecución
export const TULS_DATA: Tul[] = [
    {
        id: 'saju-jirugi',
        name: 'Saju Jirugi',
        rankRequirement: 0,
        beltName: 'Blanco (10º Gup)',
        meaning: {
            es: 'Significa "Golpe en las cuatro direcciones". Es un ejercicio fundamental para aprender los movimientos básicos de ataque y defensa en diferentes direcciones.',
            en: 'Means "Four Direction Punch". It is a fundamental exercise to learn the basic movements of attack and defense in different directions.',
            fr: 'Signifie "Coup de poing dans les quatre directions". C\'est un exercice fondamental pour apprendre les mouvements de base d\'attaque et de défense dans différentes directions.',
            de: 'Bedeutet "Vier-Richtungs-Schlag". Es ist eine grundlegende Übung, um die grundlegenden Angriffs- und Verteidigungsbewegungen in verschiedene Richtungen zu erlernen.',
            it: 'Significa "Pugno in quattro direzioni". È un esercizio fondamentale per imparare i movimenti base di attacco e difesa in diverse direzioni.',
            pt: 'Significa "Soco nas Quatro Direções". É um exercício fundamental para aprender os movimentos básicos de ataque e defesa em diferentes direções.'
        },
        beltMeaning: {
            es: 'El blanco significa la inocencia, la pureza con la que el principiante se inicia en el Taekwon-Do, sin ningún conocimiento previo.',
            en: 'White signifies innocence, as that of a beginner student who has no previous knowledge of Taekwon-Do.',
            fr: 'Le blanc signifie l\'innocence, comme celle d\'un étudiant débutant qui n\'a aucune connaissance préalable du Taekwon-Do.',
            de: 'Weiß bedeutet Unschuld, wie die eines Anfängers, der keine Vorkenntnisse über Taekwon-Do hat.',
            it: 'Il bianco significa innocenza, la purezza con cui il principiante inizia il Taekwon-Do, senza alcuna conoscenza precedente.',
            pt: 'O branco significa inocência, a pureza com que o iniciante começa no Taekwon-Do, sem nenhum conhecimento prévio.'
        },
        description: {
            es: '14 Movimientos (7 por lado). Diagrama: Cruz (+).',
            en: '14 Movements (7 por lado). Diagram: Cross (+).',
            fr: '14 Mouvements (7 por lado). Diagramme: Croix (+).',
            de: '14 Bewegungen (7 por lado). Diagramm: Kreuz (+).',
            it: '14 Movimenti (7 per lato). Diagramma: Croce (+).',
            pt: '14 Movimentos (7 por lado). Diagrama: Cruz (+).'
        },
        moves: 14,
        diagramDetails: {
            es: 'Se realiza en forma de cruz, primero hacia la derecha y luego hacia la izquierda.',
            en: 'Pending translation',
            fr: 'Traduction en attente',
            de: 'Übersetzung steht aus',
            it: 'Si esegue a forma di croce, prima verso destra e poi verso sinistra.',
            pt: 'É realizado em forma de cruz, primeiro para a direita e depois para a esquerda.'
        },
        diagramType: 'plus',
        videoId: 'bEBOFNsIsSI',
    },
    {
        id: 'saju-makgi',
        name: 'Saju Makgi',
        rankRequirement: 0,
        beltName: 'Blanco (10º Gup)',
        meaning: {
            es: 'Significa "Defensa en las cuatro direcciones". Ejercicio fundamental para coordinar desplazamientos y bloqueos básicos.',
            en: 'Means "Four Direction Block". A fundamental exercise to coordinate basic steps and blocks.',
            fr: 'Signifie "Blocage dans les quatre directions". Exercice fondamental pour coordonner les déplacements et les blocages de base.',
            de: 'Bedeutet "Vier-Richtungs-Block". Grundlegende Übung zur Koordination von grundlegenden Schritten und Blöcken.',
            it: 'Significa "Blocco in quattro direzioni". Un esercizio fondamentale per coordinare passi e blocchi di base.',
            pt: 'Significa "Defesa nas Quatro Direções". Um exercício fundamental para coordenar passos e defesas básicos.'
        },
        beltMeaning: {
            es: 'El blanco significa la inocencia, la pureza con la que el principiante se inicia en el Taekwon-Do, sin ningún conocimiento previo.',
            en: 'White signifies innocence, as that of a beginner student who has no previous knowledge of Taekwon-Do.',
            fr: 'Le blanc signifie l\'innocence, comme celle d\'un étudiant débutant qui n\'a aucune connaissance préalable du Taekwon-Do.',
            de: 'Weiß bedeutet Unschuld, wie die eines Anfängers, der keine Vorkenntnisse über Taekwon-Do hat.',
            it: 'Il bianco significa innocenza, la purezza con cui il principiante inizia il Taekwon-Do, senza alcuna conoscenza precedente.',
            pt: 'O branco significa inocência, a pureza com que o iniciante começa no Taekwon-Do, sem nenhum conhecimento prévio.'
        },
        description: {
            es: '16 Movimientos (8 por lado). Diagrama: Cruz (+).',
            en: '16 Movements (8 por lado). Diagram: Cross (+).',
            fr: '16 Mouvements (8 por lado). Diagramme: Croix (+).',
            de: '16 Bewegungen (8 por lado). Diagramm: Kreuz (+).',
            it: '16 Movimenti (8 per lato). Diagramma: Croce (+).',
            pt: '16 Movimentos (8 por lado). Diagrama: Cruz (+).'
        },
        moves: 16,
        diagramDetails: {
            es: 'Se realiza en forma de cruz, alternando defensas bajas y medias.',
            en: 'Pending translation',
            fr: 'Traduction en attente',
            de: 'Übersetzung steht aus',
            it: 'Si esegue a forma di croce, alternando difese basse e medie.',
            pt: 'É realizado em forma de cruz, alternando defesas baixas e médias.'
        },
        diagramType: 'plus',
        videoId: 'fd_JU5l3AVE',
    },
    {
        id: 'chon-ji',
        name: 'Chon-Ji',
        rankRequirement: 1, // Se aprende en 9º Gup
        beltName: 'Puntas Amarillas (9º Gup)',
        meaning: {
            es: 'Significa literalmente "el Cielo y la Tierra". Es, en Oriente, la interpretación de la creación del mundo y el principio de la historia de la Humanidad, por tal motivo es el primer Tul que aprende el principiante. El Tul tiene dos partes: una representa el Cielo y la otra la Tierra.',
            en: 'Means literally "the Heaven and the Earth". It is, in the Orient, interpreted as the creation of the world or the beginning of human history, therefore, it is the initial pattern played by the beginner. This pattern consists of two similar parts; one to represent the Heaven and the other the Earth.',
            fr: 'Signifie littéralement "le Ciel et la Terre". En Orient, il est interprété comme la création du monde ou le début de l\'histoire humaine, d\'où le fait qu\'il soit le premier Tul appris. Il se compose de deux parties : l\'une représente le Ciel et l\'autre la Terre.',
            de: 'Bedeutet wörtlich "Himmel und Erde". Im Orient wird es als Gründung der Welt und der Beginn der menschlichen Geschichte interpretiert, daher ist es das erste Tul für Anfänger. Es besteht aus zwei ähnlichen Teilen; eines repräsentiert den Himmel und das andere die Erde.',
            it: 'Significa letteralmente "il Cielo e la Terra". In Oriente, è interpretato come la creazione del mondo, quindi è il primo Tul. È composto da due parti: il Cielo e la Terra.',
            pt: 'Significa literalmente "o Céu e a Terra". No Oriente, é interpretado como a criação do mundo, por isso é o primeiro Tul. Consiste em duas partes: o Céu e a Terra.'
        },
        description: {
            es: '19 Movimientos. Diagrama: Cruz (+).',
            en: '19 Movements. Diagram: Cross (+).',
            fr: '19 Mouvements. Diagramme: Croix (+).',
            de: '19 Bewegungen. Diagramm: Kreuz (+).',
            it: '19 Movimenti. Diagramma: Croce (+).',
            pt: '19 Movimentos. Diagrama: Cruz (+).'
        },
        moves: 19,
        diagramDetails: {
            es: 'Forma de Cruz (+), comenzando en C hacia D.',
            en: 'Pending translation',
            fr: 'Traduction en attente',
            de: 'Übersetzung steht aus',
            it: 'Forma di Croce (+), partendo da C verso D.',
            pt: 'Forma de Cruz (+), começando de C em direção a D.'
        },
        diagramType: 'plus',
        videoId: 'wbf2m-S0A4U', // ID provisional
    },
    {
        id: 'dan-gun',
        name: 'Dan-Gun',
        rankRequirement: 2,
        beltName: 'Amarillo (8º Gup)',
        meaning: {
            es: 'Lleva el nombre del Santo Dan-Gun, el legendario fundador de Corea en el año 2333 A.C.',
            en: 'Is named after the holy Dan-Gun, the legendary founder of Korea in the year of 2333 B.C.',
            fr: 'Tire son nom du saint Dan-Gun, le fondateur légendaire de la Corée en l\'an 2333 av. J.-C.',
            de: 'Wurde nach dem heiligen Dan-Gun benannt, dem legendären Gründer Koreas im Jahr 2333 v. Chr.',
            it: 'Prende il nome dal Santo Dan-Gun, il leggendario fondatore della Corea nell\'anno 2333 a.C.',
            pt: 'Tem o nome de Santo Dan-Gun, o lendário fundador da Coreia no ano de 2333 a.C.'
        },
        beltMeaning: {
            es: 'El amarillo significa la tierra nutritiva, simbolizando la semilla sembrada y arraigada firmemente a medida que los fundamentos del Taekwon-Do se desarrollan.',
            en: 'Yellow signifies the earth from which a plant sprouts and takes root as the Taekwon-Do foundation is being laid.',
            fr: 'Le jaune signifie la terre d\'où germe une plante et prend racine alors que les fondations du Taekwon-Do sont posées.',
            de: 'Gelb bedeutet die Erde, aus der eine Pflanze sprießt und Wurzeln schlägt, während das Fundament des Taekwon-Do gelegt wird.',
            it: 'Il giallo significa la terra nutriente, a simboleggiare il seme piantato e radicato saldamente mentre le basi del Taekwon-Do si sviluppano.',
            pt: 'O amarelo significa a terra nutritiva, simbolizando a semente plantada e firmemente enraizada à medida que os fundamentos do Taekwon-Do se desenvolvem.'
        },
        description: {
            es: '21 Movimientos. Diagrama: I mayúscula.',
            en: '21 Movements. Diagram: Capital I.',
            fr: '21 Mouvements. Diagramme: I mayúscula.',
            de: '21 Bewegungen. Diagramm: Großes I.',
            it: '21 Movimenti. Diagramma: I maiuscola.',
            pt: '21 Movimentos. Diagrama: I maiúscula.'
        },
        moves: 21,
        diagramDetails: {
            es: 'Forma de I mayúscula.',
            en: 'Pending translation',
            fr: 'Traduction en attente',
            de: 'Übersetzung steht aus',
            it: 'Forma di I maiuscola.',
            pt: 'Forma de I maiúscula.'
        },
        diagramType: 'I',
        videoId: 'EeOVNBWAUH0',
    },
    {
        id: 'do-san',
        name: 'Do-San',
        rankRequirement: 3,
        beltName: 'Puntas Verdes (7º Gup)',
        meaning: {
            es: 'Es el seudónimo del patriota Ahn Chang-Ho (1876-1938). Los 24 movimientos representan su vida dedicada a la educación y a la independencia de Corea.',
            en: 'Is the pseudonym of the patriot Ahn Chang-Ho (1876-1938). The 24 movements represent his entire life which he devoted to furthering the education of Korea and its independence movement.',
            fr: 'Est le pseudonyme du patriote Ahn Chang-Ho (1876-1938). Les 24 mouvements représentent sa vie consacrée à l\'éducation et à l\'indépendance de la Corée.',
            de: 'Ist das Pseudonym des Patrioten Ahn Chang-Ho (1876-1938). Die 24 Bewegungen repräsentieren sein Leben, das er der Bildung und der Unabhängigkeit Koreas gewidmet hat.',
            it: 'È lo pseudonimo del patriota Ahn Chang-Ho. I 24 movimenti rappresentano la sua vita dedicata all\'educazione della Corea e all\'indipendenza.',
            pt: 'É o pseudônimo do patriota Ahn Chang-Ho. Os 24 movimentos representam sua vida dedicada à educação da Coreia e à independência.'
        },
        description: {
            es: '24 Movimientos.',
            en: '24 Movements.',
            fr: '24 Mouvements.',
            de: '24 Bewegungen.',
            it: '24 Movimenti.',
            pt: '24 Movimentos.'
        },
        moves: 24,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'other',
        videoId: 'hRPYEc3PJL0',
    },
    {
        id: 'won-hyo',
        name: 'Won-Hyo',
        rankRequirement: 4,
        beltName: 'Verde (6º Gup)',
        meaning: {
            es: 'Fue el monje que introdujo el budismo en la dinastía Silla en el año 686 D.C.',
            en: 'Was the noted monk who introduced Buddhism to the Silla Dynasty in the year of 686 A.D.',
            fr: 'Fut le moine qui introduisit le bouddhisme sous la dynastie Silla en l\'an 686 apr. J.-C.',
            de: 'War ein bemerksenswerter Mönch, der im Jahr 686 n. Chr. den Buddhismus in die Silla-Dynastie einführte.',
            it: 'Era il noto monaco che introdusse il buddismo nella dinastia Silla nell\'anno 686 d.C.',
            pt: 'Foi o notável monge que introduziu o budismo na Dinastia Silla no ano de 686 d.C.'
        },
        beltMeaning: {
            es: 'El verde significa el crecimiento de la planta, indicando que la técnica del Taekwon-Do se desarrolla igual que la planta.',
            en: 'Green signifies the plant\'s growth as the Taekwon-Do skill begins to develop.',
            fr: 'Le vert signifie la croissance de la plante alors que les compétences en Taekwon-Do commencent à se développer.',
            de: 'Grün bedeutet das Wachstum der Pflanze, während sich die Taekwon-Do-Fähigkeiten zu entwickeln beginnen.',
            it: 'Il verde significa la crescita della pianta, indicando che la tecnica del Taekwon-Do si sviluppa proprio come la pianta.',
            pt: 'O verde significa o crescimento da planta, indicando que a técnica do Taekwon-Do se desenvolve como a planta.'
        },
        description: {
            es: '28 Movimientos.',
            en: '28 Movements.',
            fr: '28 Mouvements.',
            de: '28 Bewegungen.',
            it: '28 Movimenti.',
            pt: '28 Movimentos.'
        },
        moves: 28,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'Z13sb_WWSCg',
    },
    {
        id: 'yul-gok',
        name: 'Yul-Gok',
        rankRequirement: 5,
        beltName: 'Puntas Azules (5º Gup)',
        meaning: {
            es: 'Es el seudónimo del gran filósofo y erudito Yi I (1536-1584), apodado el "Confucio de Corea". Los 38 movimientos se refieren a su lugar de nacimiento en los 38 grados de latitud y el diagrama representa "erudito" (maestro).',
            en: 'Is the pseudonym of a great philosopher and scholar Yi I (1536-1584) nicknamed the "Confucius of Korea". The 38 movements of this pattern refer to his birthplace on 38 latitude and the diagram represents "scholar" (teacher).',
            fr: 'Est le pseudonyme d\'un grand philosophe et érudit Yi I (1536-1584) surnommé le "Confucius de Corée". Les 38 mouvements de ce modèle se réfèrent à son lieu de naissance sur 38 latitude et le diagramme représente "l\'érudit".',
            de: 'Ist das Pseudonym des großen Philosophen und Gelehrten Yi I (1536-1584), der den Spitznamen "Konfuzius von Korea" trug. Die 38 Bewegungen beziehen sich auf seinen Geburtsort auf dem 38. Breitengrad und das Diagramm bedeutet "Gelehrter".',
            it: 'È lo pseudonimo del grande filosofo Yi I, soprannominato il "Confucio di Corea". 38 movimenti per il suo luogo di nascita sul 38° parallelo.',
            pt: 'É o pseudônimo do grande filósofo Yi I, apelidado de "Confúcio da Coreia". 38 movimentos pelo seu local de nascimento no paralelo 38.'
        },
        description: {
            es: '38 Movimientos.',
            en: '38 Movements.',
            fr: '38 Mouvements.',
            de: '38 Bewegungen.',
            it: '38 Movimenti.',
            pt: '38 Movimentos.'
        },
        moves: 38,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'scholar',
        videoId: 'IjVMFGeLYf0',
    },
    {
        id: 'joong-gun',
        name: 'Joong-Gun',
        rankRequirement: 6,
        beltName: 'Azul (4º Gup)',
        meaning: {
            es: 'Lleva el nombre del patriota Ahn Joong-Gun que asesinó a Hiro-Bumi Ito, el primer gobernador general japonés de Corea. Los 32 movimientos representan la edad del Sr. Ahn cuando fue ejecutado en la prisión de Lui-Shung (1910).',
            en: 'Is named after the patriot Ahn Joong-Gun who assassinated Hiro-Bumi Ito, the first Japanese governor-general of Korea. There are 32 movements in this pattern to represent Mr. Ahn\'s age when he was executed in a Lui-Shung prison (1910).',
            fr: 'Porte le nom du patriote Ahn Joong-Gun qui a assassiné Hiro-Bumi Ito, le premier gouverneur général japonais de Corée. Les 32 mouvements représentent l\'âge de M. Ahn lors de son exécution dans la prison de Lui-Shung.',
            de: 'Wurde nach dem Patrioten Ahn Joong-Gun benannt, der Hiro-Bumi Ito, den ersten japanischen Generalgouverneur von Korea, ermordete. Die 32 Bewegungen stehen für das Alter von Ahn, als er im Gefängnis von Lui-Shung hingerichtet wurde.',
            it: 'Prende il nome dal patriota Ahn Joong-Gun. I 32 movimenti rappresentano l\'età in cui fu giustiziato in prigione nel 1910.',
            pt: 'Tem o nome do patriota Ahn Joong-Gun. Os 32 movimentos representam a idade em que foi executado na prisão em 1910.'
        },
        beltMeaning: {
            es: 'El azul significa el Cielo. Demuestra el crecimiento y el progreso de la planta que crece como su conocimiento en Taekwon-Do hacia el cielo.',
            en: 'Blue signifies the Heaven, toward which the plant matures into a towering tree as training in Taekwon-Do progresses.',
            fr: 'Le bleu signifie le Ciel, vers lequel la plante mûrit pour devenir un arbre imposant au fur et à mesure que l\'entraînement au Taekwon-Do progresse.',
            de: 'Blau bedeutet der Himmel, dem entgegen die Pflanze zu einem mächtigen Baum heranreift, während das Training im Taekwon-Do fortschreitet.',
            it: 'Il blu significa il Cielo. Dimostra la crescita e il progresso della pianta che cresce come la sua conoscenza del Taekwon-Do verso il cielo.',
            pt: 'O azul significa o Céu. Demonstra o crescimento e o progresso da planta que cresce como o seu conhecimento de Taekwon-Do em direção ao céu.'
        },
        description: {
            es: '32 Movimientos.',
            en: '32 Movements.',
            fr: '32 Mouvements.',
            de: '32 Bewegungen.',
            it: '32 Movimenti.',
            pt: '32 Movimentos.'
        },
        moves: 32,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'ZasS9RifxQw',
    },
    // Añadir más Tuls según se necesiten, siguiendo la misma estructura
    {
        id: 'toi-gye',
        name: 'Toi-Gye',
        rankRequirement: 7,
        beltName: 'Puntas Rojas (3º Gup)',
        meaning: {
            es: 'Es el seudónimo del destacado erudito Yi Hwang (1501-1570). Los 37 movimientos refieren a su lugar de nacimiento en los 37 grados de latitud.',
            en: 'Is the pen name of the noted scholar Yi Hwang (1501-1570), an authority on neo Confucianism. The 37 movements of the pattern refer to his birthplace on 37 latitude.',
            fr: 'Est le pseudonyme de l\'éminent érudit Yi Hwang (1501-1570). Les 37 mouvements se réfèrent à son lieu de naissance sur le 37e degré de latitude.',
            de: 'Ist das Pseudonym des berühmten Gelehrten Yi Hwang. Die 37 Bewegungen beziehen sich auf seinen Geburtsort auf dem 37. Breitengrad.',
            it: 'È lo pseudonimo del noto studioso Yi Hwang. I 37 movimenti si riferiscono al suo luogo di nascita alla latitudine 37.',
            pt: 'É o pseudônimo do notável estudioso Yi Hwang. Os 37 movimentos referem-se ao seu local de nascimento na latitude 37.'
        },
        description: {
            es: '37 Movimientos. Diagrama: Erudito.',
            en: '37 Movements. Diagram: Scholar.',
            fr: '37 Mouvements. Diagramme: Érudit.',
            de: '37 Bewegungen. Diagramm: Gelehrter.',
            it: '37 Movimenti. Diagramma: Erudito.',
            pt: '37 Movimentos. Diagrama: Erudito.'
        },
        moves: 37,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'scholar',
        videoId: 'tVvGL-EdYVc',
    },
    {
        id: 'hwa-rang',
        name: 'Hwa-Rang',
        rankRequirement: 8,
        beltName: 'Rojo (2º Gup)',
        meaning: {
            es: 'Es el nombre del grupo juvenil "Hwa Rang" que se originó en la dinastía Silla a principios del siglo VII. Los 29 movimientos refieren a la 29ª División de Infantería.',
            en: 'Is named after the Hwa-Rang youth group, which originated in the Silla Dynasty in the early 7th century. The 29 movements refer to the 29th Infantry Division, where Taekwon-Do developed into maturity.',
            fr: 'Nommé après le groupe de jeunes Hwa-Rang, de la dynastie Silla. Les 29 mouvements se réfèrent à la 29ème division d\'infanterie.',
            de: 'Benannt nach der Hwa-Rang Jugendgruppe aus der Silla-Dynastie. Die 29 Bewegungen beziehen sich auf die 29. Infanteriedivision.',
            it: 'Prende il nome dal gruppo giovanile Hwa-Rang della dinastia Silla. I 29 movimenti si riferiscono alla 29a divisione di fanteria.',
            pt: 'Tem o nome do grupo de jovens Hwa-Rang da Dinastia Silla. Os 29 movimentos referem-se à 29ª Divisão de Infantaria.'
        },
        beltMeaning: {
            es: 'El rojo significa peligro. Advierte al estudiante que debe aprender a tener control de sí mismo, a la vez que alerta al oponente a mantenerse a distancia.',
            en: 'Red signifies danger, cautioning the student to exercise control and warning the opponent to stay away.',
            fr: 'Le rouge signifie le danger, avertissant l\'étudiant d\'exercer un contrôle et avertissant l\'adversaire de rester à l\'écart.',
            de: 'Rot bedeutet Gefahr, warnt den Schüler, Kontrolle zu üben, und warnt den Gegner, Abstand zu halten.',
            it: 'Il rosso significa pericolo. Avverte lo studente di esercitare il controllo e avverte l\'avversario di stare lontano.',
            pt: 'O vermelho significa perigo. Adverte o aluno a exercer controle e avisa o oponente a ficar longe.'
        },
        description: {
            es: '29 Movimientos. Diagrama: I mayúscula.',
            en: '29 Movements. Diagram: Capital I.',
            fr: '29 Mouvements. Diagramme: I mayúscula.',
            de: '29 Bewegungen. Diagramm: Großes I.',
            it: '29 Movimenti. Diagramma: I maiuscola.',
            pt: '29 Movimentos. Diagrama: I maiúscula.'
        },
        moves: 29,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'F-5qLBRXLSI',
    },
    {
        id: 'choong-moo',
        name: 'Choong-Moo',
        rankRequirement: 9,
        beltName: 'Puntas Negras (1º Gup)',
        meaning: {
            es: 'Fue el nombre dado al gran Almirante Yi Sun-Sin de la dinastía Yi. Se le atribuye haber inventado el barco tortuga (Kobukson).',
            en: 'Was the name given to the great Admiral Yi Soon-Sin of the Lee Dynasty. He was reputed to have invented the first armored battleship (Kobukson) in 1592.',
            fr: 'Nom donné à l\'Amiral Yi Soon-Sin, inventeur du navire tortue (Kobukson).',
            de: 'Der Name des großen Admirals Yi Soon-Sin, Erfinder des gepanzerten Schildkrötenschiffs (Kobukson).',
            it: 'Era il nome dato al grande ammiraglio Yi Soon-Sin, presunto inventore della prima corazzata (Kobukson).',
            pt: 'Era o nome dado ao grande almirante Yi Soon-Sin, suposto inventor do primeiro navio encouraçado (Kobukson).'
        },
        description: {
            es: '30 Movimientos. Diagrama: I mayúscula.',
            en: '30 Movements. Diagram: Capital I.',
            fr: '30 Mouvements. Diagramme: I mayúscula.',
            de: '30 Bewegungen. Diagramm: Großes I.',
            it: '30 Movimenti. Diagramma: I maiuscola.',
            pt: '30 Movimentos. Diagrama: I maiúscula.'
        },
        moves: 30,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'Yymtsz3FyE0',
    },
    {
        id: 'kwang-gae',
        name: 'Kwang-Gae',
        rankRequirement: 10,
        beltName: 'I Dan',
        meaning: {
            es: 'Lleva el nombre del famoso Kwang-Gae-Toh-Wang, el 19º rey de la dinastía Koguryo, quien recuperó los territorios perdidos.',
            en: 'Is named after the famous Kwang-Gae-Toh-Wang, the 19th King of the Koguryo Dynasty, who regained all the lost territories including the greater part of Manchuria.',
            fr: 'Nommé après le Roi Kwang-Gae-Toh-Wang qui a reconquis de nombreux territoires perdus.',
            de: 'Benannt nach dem berühmten König Kwang-Gae-Toh-Wang, der alle verlorenen Gebiete zurückeroberte.',
            it: 'Prende il nome dal famoso Re Kwang-Gae-Toh-Wang, che riconquistò molti territori perduti.',
            pt: 'Tem o nome do famoso Rei Kwang-Gae-Toh-Wang, que reconquistou muitos territórios perdidos.'
        },
        beltMeaning: {
            es: 'El negro es el opuesto al blanco. Por tanto, representa la madurez, la superación de las pruebas y la protección contra la oscuridad y el miedo.',
            en: 'Black is the opposite of white, therefore, signifying the maturity and proficiency in Taekwon-Do. It also indicates the wearer\'s imperviousness to darkness and fear.',
            fr: 'Le noir est l\'opposé du blanc, signifiant par conséquent la maturité et la maîtrise du Taekwon-Do. Cela indique également l\'imperméabilité du porteur à l\'obscurité et à la peur.',
            de: 'Schwarz ist das Gegenteil von Weiß und bedeutet daher Reife und Können im Taekwon-Do. Es zeigt auch die Unempfindlichkeit des Trägers gegenüber Dunkelheit und Angst.',
            it: 'Il nero è l\'opposto del bianco. Pertanto, rappresenta la maturità, il superamento delle prove e la protezione dall\'oscurità e dalla paura.',
            pt: 'O preto é o oposto do branco. Portanto, representa maturidade, superação de provações e proteção contra a escuridão e o medo.'
        },
        description: {
            es: '39 Movimientos.',
            en: '39 Movements.',
            fr: '39 Mouvements.',
            de: '39 Bewegungen.',
            it: '39 Movimenti.',
            pt: '39 Movimentos.'
        },
        moves: 39,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: '9Qrg-Mk90J4',
    },
    {
        id: 'po-eun',
        name: 'Po-Eun',
        rankRequirement: 10,
        beltName: 'I Dan',
        meaning: {
            es: 'Es el seudónimo del leal sujeto Chong Mong-Chu (1400), un famoso poeta.',
            en: 'Is the pseudonym of a loyal subject Chong Mong-Chu (1400) who was a famous poet and whose poem "I would not serve a second master though I might be crucified a hundred times" is known to every Korean.',
            fr: 'Pseudonyme du loyal poète Chong Mong-Chu.',
            de: 'Das Pseudonym des loyalen Dichters Chong Mong-Chu.',
            it: 'È lo pseudonimo di un suddito leale Chong Mong-Chu, un famoso poeta.',
            pt: 'É o pseudônimo de um súdito leal Chong Mong-Chu, um famoso poeta.'
        },
        beltMeaning: {
            es: 'El negro es el opuesto al blanco. Por tanto, representa la madurez, la superación de las pruebas y la protección contra la oscuridad y el miedo.',
            en: 'Black is the opposite of white, therefore, signifying the maturity and proficiency in Taekwon-Do. It also indicates the wearer\'s imperviousness to darkness and fear.',
            fr: 'Le noir est l\'opposé du blanc, signifiant par conséquent la maturité et la maîtrise du Taekwon-Do. Cela indique également l\'imperméabilité du porteur à l\'obscurité et à la peur.',
            de: 'Schwarz ist das Gegenteil von Weiß und bedeutet daher Reife und Können im Taekwon-Do. Es zeigt auch die Unempfindlichkeit des Trägers gegenüber Dunkelheit und Angst.',
            it: 'Il nero è l\'opposto del bianco. Pertanto, rappresenta la maturità, il superamento delle prove e la protezione dall\'oscurità e dalla paura.',
            pt: 'O preto é o oposto do branco. Portanto, representa maturidade, superação de provações e proteção contra a escuridão e o medo.'
        },
        description: {
            es: '36 Movimientos.',
            en: '36 Movements.',
            fr: '36 Mouvements.',
            de: '36 Bewegungen.',
            it: '36 Movimenti.',
            pt: '36 Movimentos.'
        },
        moves: 36,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'ZRa52syjAGQ',
    },
    {
        id: 'ge-baek',
        name: 'Ge-Baek',
        rankRequirement: 10,
        beltName: 'I Dan',
        meaning: {
            es: 'Lleva el nombre de Ge-Baek, un gran general de la dinastía Baek Je (660 d.C.).',
            en: 'Is named after Ge-Baek, a great general in the Baek Je Dynasty (660 AD).',
            fr: 'Nommé après Ge-Baek, un grand général de la dynastie Baek Je.',
            de: 'Benannt nach Ge-Baek, einem großen General der Baek Je-Dynastie.',
            it: 'Prende il nome da Ge-Baek, un grande generale della dinastia Baek Je.',
            pt: 'Tem o nome de Ge-Baek, um grande general da Dinastia Baek Je.'
        },
        beltMeaning: {
            es: 'El negro es el opuesto al blanco. Por tanto, representa la madurez, la superación de las pruebas y la protección contra la oscuridad y el miedo.',
            en: 'Black is the opposite of white, therefore, signifying the maturity and proficiency in Taekwon-Do. It also indicates the wearer\'s imperviousness to darkness and fear.',
            fr: 'Le noir est l\'opposé du blanc, signifiant par conséquent la maturité et la maîtrise du Taekwon-Do. Cela indique également l\'imperméabilité du porteur à l\'obscurité et à la peur.',
            de: 'Schwarz ist das Gegenteil von Weiß und bedeutet daher Reife und Können im Taekwon-Do. Es zeigt auch die Unempfindlichkeit des Trägers gegenüber Dunkelheit und Angst.',
            it: 'Il nero è l\'opposto del bianco. Pertanto, rappresenta la maturità, il superamento delle prove e la protezione dall\'oscurità e dalla paura.',
            pt: 'O preto é o oposto do branco. Portanto, representa maturidade, superação de provações e proteção contra a escuridão e o medo.'
        },
        description: {
            es: '44 Movimientos.',
            en: '44 Movements.',
            fr: '44 Mouvements.',
            de: '44 Bewegungen.',
            it: '44 Movimenti.',
            pt: '44 Movimentos.'
        },
        moves: 44,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'luybsetPu1A',
    },
    {
        id: 'eui-am',
        name: 'Eui-Am',
        rankRequirement: 11,
        beltName: 'II Dan',
        meaning: {
            es: 'Es el seudónimo de Son Byong Hi, líder del movimiento de independencia de Corea el 1 de marzo de 1919.',
            en: 'Is the pseudonym of Son Byong Hi, leader of the Korean independence movement on March 1, 1919.',
            fr: 'Pseudonyme de Son Byong Hi, chef du mouvement d\'indépendance coréen.',
            de: 'Pseudonym von Son Byong Hi, Führer der koreanischen Unabhängigkeitsbewegung.',
            it: 'È lo pseudonimo di Son Byong Hi, leader del movimento di indipendenza coreano.',
            pt: 'É o pseudônimo de Son Byong Hi, líder do movimento de independência coreano.'
        },
        description: {
            es: '45 Movimientos.',
            en: '45 Movements.',
            fr: '45 Mouvements.',
            de: '45 Bewegungen.',
            it: '45 Movimenti.',
            pt: '45 Movimentos.'
        },
        moves: 45,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'inMKh0lC_KI',
    },
    {
        id: 'choong-jang',
        name: 'Choong-Jang',
        rankRequirement: 11,
        beltName: 'II Dan',
        meaning: {
            es: 'Es el seudónimo del general Kim Duk Ryang, quien vivió durante la dinastía Yi, siglo XIV.',
            en: 'Is the pseudonym given to General Kim Duk Ryang who lived during the Lee Dynasty, 14th century.',
            fr: 'Pseudonyme donné au Général Kim Duk Ryang de la dynastie Lee.',
            de: 'Pseudonym des Generals Kim Duk Ryang aus der Lee-Dynastie.',
            it: 'È lo pseudonimo dato al generale Kim Duk Ryang della dinastia Lee.',
            pt: 'É o pseudônimo dado ao General Kim Duk Ryang da Dinastia Lee.'
        },
        description: {
            es: '52 Movimientos.',
            en: '52 Movements.',
            fr: '52 Mouvements.',
            de: '52 Bewegungen.',
            it: '52 Movimenti.',
            pt: '52 Movimentos.'
        },
        moves: 52,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'cWZL2LErGTg',
    },
    {
        id: 'ju-che',
        name: 'Ju-Che',
        rankRequirement: 11,
        beltName: 'II Dan',
        meaning: {
            es: 'Es una idea filosófica según la cual el hombre es el dueño de todo y decide todo.',
            en: 'Is a philosophical idea that man is the master of everything and decides everything.',
            fr: 'C\'est l\'idée philosophique selon laquelle l\'homme est le maître de tout et décide de tout.',
            de: 'Es ist eine philosophische Idee, nach der der Mensch der Herrscher über alles ist und alles entscheidet.',
            it: 'È un\'idea filosofica secondo cui l\'uomo è il padrone di tutto e decide tutto.',
            pt: 'É uma ideia filosófica de que o homem é o mestre de tudo e decide tudo.'
        },
        description: {
            es: '45 Movimientos.',
            en: '45 Movements.',
            fr: '45 Mouvements.',
            de: '45 Bewegungen.',
            it: '45 Movimenti.',
            pt: '45 Movimentos.'
        },
        moves: 45,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'Njh6VVLdKsk',
    },
    {
        id: 'sam-il',
        name: 'Sam-Il',
        rankRequirement: 12,
        beltName: 'III Dan',
        meaning: {
            es: 'Denota la fecha histórica del movimiento de independencia de Corea el 1 de marzo de 1919.',
            en: 'Denotes the historical date of the independence movement of Korea which began throughout the country on March 1, 1919.',
            fr: 'Note la date historique du mouvement d\'indépendance de la Corée le 1er mars 1919.',
            de: 'Bezeichnet das historische Datum der Unabhängigkeitsbewegung Koreas am 1. März 1919.',
            it: 'Indica la data storica del movimento di indipendenza della Corea del 1 marzo 1919.',
            pt: 'Indica a data histórica do movimento de independência da Coreia de 1º de março de 1919.'
        },
        description: {
            es: '33 Movimientos.',
            en: '33 Movements.',
            fr: '33 Mouvements.',
            de: '33 Bewegungen.',
            it: '33 Movimenti.',
            pt: '33 Movimentos.'
        },
        moves: 33,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'xG4uBuH4NCE',
    },
    {
        id: 'yoo-sin',
        name: 'Yoo-Sin',
        rankRequirement: 12,
        beltName: 'III Dan',
        meaning: {
            es: 'Lleva el nombre del general Kim Yoo Sin, comandante general durante la dinastía Silla.',
            en: 'Is named after General Kim Yoo Sin, a commanding general during the Silla Dynasty.',
            fr: 'Nommé après le Général Kim Yoo Sin.',
            de: 'Benannt nach General Kim Yoo Sin.',
            it: 'Prende il nome dal generale Kim Yoo Sin della dinastia Silla.',
            pt: 'Tem o nome do General Kim Yoo Sin da Dinastia Silla.'
        },
        description: {
            es: '68 Movimientos.',
            en: '68 Movements.',
            fr: '68 Mouvements.',
            de: '68 Bewegungen.',
            it: '68 Movimenti.',
            pt: '68 Movimentos.'
        },
        moves: 68,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: '8TOZVmWKJws',
    },
    {
        id: 'choi-yong',
        name: 'Choi-Yong',
        rankRequirement: 12,
        beltName: 'III Dan',
        meaning: {
            es: 'Lleva el nombre del general Choi Yong, premier y comandante en jefe de las fuerzas armadas durante la dinastía Koryo.',
            en: 'Is named after General Choi Yong, premier and commander in chief of the armed forces during the 14th century Koryo Dynasty.',
            fr: 'Nommé après le Général Choi Yong de la dynastie Koryo.',
            de: 'Benannt nach General Choi Yong aus der Koryo-Dynastie.',
            it: 'Prende il nome dal generale Choi Yong della dinastia Koryo.',
            pt: 'Tem o nome do General Choi Yong da Dinastia Koryo.'
        },
        description: {
            es: '46 Movimientos.',
            en: '46 Movements.',
            fr: '46 Mouvements.',
            de: '46 Bewegungen.',
            it: '46 Movimenti.',
            pt: '46 Movimentos.'
        },
        moves: 46,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'PZXdNG3Bs4U',
    },
    {
        id: 'yon-gae',
        name: 'Yon-Gae',
        rankRequirement: 13,
        beltName: 'IV Dan',
        meaning: {
            es: 'Lleva el nombre del general Yon Gae Somoon. Los 49 movimientos refieren a los últimos dos números del año 649 d.C.',
            en: 'Is named after a famous general during the Koguryo Dynasty, Yon Gae Somoon. The 49 movements refer to the last two figures of 649 A.D.',
            fr: 'Nommé après le général Yon Gae Somoon. Les 49 mouvements font référence à l\'année 649.',
            de: 'Benannt nach General Yon Gae Somoon. Die 49 Bewegungen beziehen sich auf das Jahr 649.',
            it: 'Prende il nome dal generale Yon Gae Somoon. I 49 movimenti si riferiscono all\'anno 649.',
            pt: 'Tem o nome do general Yon Gae Somoon. Os 49 movimentos referem-se ao ano de 649.'
        },
        description: {
            es: '49 Movimientos.',
            en: '49 Movements.',
            fr: '49 Mouvements.',
            de: '49 Bewegungen.',
            it: '49 Movimenti.',
            pt: '49 Movimentos.'
        },
        moves: 49,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'placeholder',
    },
    {
        id: 'ul-ji',
        name: 'Ul-Ji',
        rankRequirement: 13,
        beltName: 'IV Dan',
        meaning: {
            es: 'Lleva el nombre del general Ul-Ji Moon Dok que defendió a Corea contra la invasión Tang.',
            en: 'Is named after general Ul-Ji Moon Dok who successfully defended Korea against a Tang\'s invasion force of nearly one million soldiers.',
            fr: 'Nommé après le général Ul-Ji Moon Dok, célèbre défenseur de la Corée.',
            de: 'Benannt nach General Ul-Ji Moon Dok, der Korea erfolgreich verteidigte.',
            it: 'Prende il nome dal generale Ul-Ji Moon Dok, noto per aver difeso la Corea.',
            pt: 'Tem o nome do general Ul-Ji Moon Dok, noto por defender a Coreia.'
        },
        description: {
            es: '42 Movimientos.',
            en: '42 Movements.',
            fr: '42 Mouvements.',
            de: '42 Bewegungen.',
            it: '42 Movimenti.',
            pt: '42 Movimentos.'
        },
        moves: 42,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'placeholder',
    },
    {
        id: 'moon-moo',
        name: 'Moon-Moo',
        rankRequirement: 13,
        beltName: 'IV Dan',
        meaning: {
            es: 'Honor al 30º rey de Silla. Su cuerpo fue enterrado cerca de Dae Wang Am (Gran Roca del Rey).',
            en: 'Honors the 30th King of the Silla Dynasty. His body was buried near Dae Wang Am (Great King\'s Rock).',
            fr: 'Honneur au 30ème Roi de la dynastie Silla.',
            de: 'Ehrt den 30. König der Silla-Dynastie.',
            it: 'Onora il 30° re della dinastia Silla.',
            pt: 'Homenageia o 30º Rei da Dinastia Silla.'
        },
        description: {
            es: '61 Movimientos.',
            en: '61 Movements.',
            fr: '61 Mouvements.',
            de: '61 Bewegungen.',
            it: '61 Movimenti.',
            pt: '61 Movimentos.'
        },
        moves: 61,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'placeholder',
    },
    {
        id: 'so-san',
        name: 'So-San',
        rankRequirement: 14,
        beltName: 'V Dan',
        meaning: {
            es: 'Es el seudónimo del gran monje Choi Hyong Ung (1520-1604) durante la dinastía Yi.',
            en: 'Is the pseudonym of the great monk Choi Hyong Ung (1520-1604) during the Lee Dynasty.',
            fr: 'Pseudonyme du grand moine Choi Hyong Ung.',
            de: 'Pseudonym des großen Mönchs Choi Hyong Ung.',
            it: 'È lo pseudonimo del grande monaco Choi Hyong Ung.',
            pt: 'É o pseudônimo do grande monge Choi Hyong Ung.'
        },
        description: {
            es: '72 Movimientos.',
            en: '72 Movements.',
            fr: '72 Mouvements.',
            de: '72 Bewegungen.',
            it: '72 Movimenti.',
            pt: '72 Movimentos.'
        },
        moves: 72,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'placeholder',
    },
    {
        id: 'se-jong',
        name: 'Se-Jong',
        rankRequirement: 14,
        beltName: 'V Dan',
        meaning: {
            es: 'Lleva el nombre del más grande rey coreano, Se-Jong, quien inventó el alfabeto coreano en 1443.',
            en: 'Is named after the greatest Korean King, Se-Jong, who invented the Korean alphabet in 1443.',
            fr: 'Nommé après le grand Roi Se-Jong qui a inventé l\'alphabet coréen.',
            de: 'Benannt nach König Se-Jong, dem Erfinder des koreanischen Alphabets.',
            it: 'Prende il nome dal più grande re coreano, Se-Jong, che ha inventato l\'alfabeto coreano.',
            pt: 'Tem o nome do maior Rei coreano, Se-Jong, que inventou o alfabeto coreano.'
        },
        description: {
            es: '24 Movimientos.',
            en: '24 Movements.',
            fr: '24 Mouvements.',
            de: '24 Bewegungen.',
            it: '24 Movimenti.',
            pt: '24 Movimentos.'
        },
        moves: 24,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'placeholder',
    },
    {
        id: 'tong-il',
        name: 'Tong-Il',
        rankRequirement: 15,
        beltName: 'VI Dan',
        meaning: {
            es: 'Denota la resolución de la unificación de Corea que ha estado dividida desde 1945.',
            en: 'Denotes the resolution of the unification of Korea which has been divided since 1945. The diagram symbolizes the homogenous race.',
            fr: 'Désigne la résolution de l\'unification de la Corée divisée depuis 1945.',
            de: 'Bezeichnet die Resolution zur Wiedervereinigung Koreas, das seit 1945 geteilt ist.',
            it: 'Indica la risoluzione dell\'unificazione della Corea.',
            pt: 'Indica a resolução da unificação da Coreia.'
        },
        description: {
            es: '56 Movimientos.',
            en: '56 Movements.',
            fr: '56 Mouvements.',
            de: '56 Bewegungen.',
            it: '56 Movimenti.',
            pt: '56 Movimentos.'
        },
        moves: 56,
        diagramDetails: {
            es: '',
            en: '',
            fr: '',
            de: '',
            it: '',
            pt: ''
        },
        diagramType: 'I',
        videoId: 'placeholder',
    },
];


