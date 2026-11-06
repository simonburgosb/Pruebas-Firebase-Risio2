export const renalBook = {
  title: 'Fisiología renal',
  author: 'Elsi Olaya Estefan',
  url: './assets/fisiologia-renal.pdf'
};

const question = (page, prompt, options, correct, explanation) => ({page, prompt, options, correct, explanation});

// Las páginas se cuentan desde la primera hoja del PDF, incluida la portada.
export const workshops = [
  {
    id: 'morfologia-v1', chapter: 1, title: 'Morfología y función renal', pages: [2, 20],
    summary: 'Relaciona la anatomía del riñón, la nefrona y su circulación.',
    questions: [
      question(4, 'En un corte del riñón, ¿qué estructura se prolonga entre las pirámides?', ['La pelvis renal', 'Las columnas de Bertin', 'Los cálices menores', 'Las papilas renales'], 1, 'Las columnas de Bertin son prolongaciones de la corteza entre las pirámides medulares.'),
      question(6, '¿Qué distingue a una nefrona yuxtamedular?', ['Tiene su glomérulo en la papila', 'Carece de asa de Henle', 'Su asa termina en la corteza', 'Su glomérulo está cerca de la médula y su asa penetra profundamente en ella'], 3, 'Las nefronas yuxtamedulares tienen glomérulos cerca de la unión corticomedular y asas largas.'),
      question(8, '¿Qué vaso lleva sangre hacia los capilares del glomérulo?', ['Arteriola aferente', 'Arteriola eferente', 'Vena interlobular', 'Vaso recto ascendente'], 0, 'La arteriola aferente entra por el polo vascular. La eferente recoge la sangre que sale del glomérulo.'),
      question(13, '¿Con qué estructura se relacionan las células de la mácula densa en el aparato yuxtaglomerular?', ['El epitelio de la pelvis renal', 'Los orificios de la papila', 'Las arteriolas del polo vascular', 'La cápsula fibrosa externa'], 2, 'La mácula densa se ubica cerca de las arteriolas aferente y eferente en el polo vascular.'),
      question(17, 'Tras salir de los capilares glomerulares, ¿por qué vaso continúa la sangre antes de la red peritubular?', ['Arteriola eferente', 'Arteriola aferente', 'Arteria renal', 'Vena renal'], 0, 'La arteriola eferente conecta la red glomerular con la circulación peritubular.')
    ]
  },
  {
    id: 'filtracion-v1', chapter: 2, title: 'Filtración glomerular', pages: [21, 40],
    summary: 'Aplica las fuerzas de filtración, la fracción de filtración y la autorregulación.',
    questions: [
      question(22, '¿Qué conjunto integra la barrera glomerular?', ['Mesangio, túbulo proximal y cápsula renal', 'Arteriolas, mácula densa y células granulares', 'Endotelio fenestrado, membrana basal y podocitos', 'Epitelio parietal, asas de Henle y endotelio venoso'], 2, 'El filtrado atraviesa el endotelio fenestrado, la membrana basal y las hendiduras entre pedicelos.'),
      question(26, 'Si aumenta la presión en el espacio de Bowman y las demás fuerzas se mantienen, ¿qué sucede con la presión neta de filtración?', ['Aumenta en la misma magnitud', 'Disminuye', 'Se mantiene porque solo importa el Kf', 'Se iguala a la presión arterial'], 1, 'La presión hidrostática capsular se opone a la filtración y se resta al calcular la presión neta.'),
      question(28, 'Si la presión neta permanece constante pero disminuye el Kf, ¿qué ocurre con la TFG?', ['Aumenta', 'Queda igual', 'Se iguala al flujo plasmático', 'Disminuye'], 3, 'La TFG resulta de multiplicar el Kf por la presión neta de filtración.'),
      question(29, 'Con una TFG de 120 mL/min y un flujo plasmático renal de 600 mL/min, ¿cuál es la fracción de filtración?', ['20 %', '5 %', '50 %', '80 %'], 0, 'Se divide la TFG entre el flujo plasmático renal. 120 ÷ 600 = 0,20.'),
      question(35, 'En la respuesta miogénica, ¿qué hace el músculo liso arteriolar al aumentar la presión de perfusión?', ['Se relaja al distenderse la pared', 'Se contrae tras distenderse la pared', 'Deja de responder al estiramiento', 'Disminuye la resistencia sin cambiar el tono'], 1, 'El estiramiento de la pared induce contracción del músculo liso, lo que limita el aumento del flujo.')
    ]
  },
  {
    id: 'tubulos-v1', chapter: 3, title: 'Funciones tubulares', pages: [41, 67],
    summary: 'Sigue el manejo tubular de glucosa, sodio y agua.',
    questions: [
      question(43, '¿En qué dirección se mueve un soluto durante la reabsorción tubular?', ['Del plasma hacia la luz tubular', 'De la luz tubular hacia el intersticio y la sangre', 'De la cápsula hacia la arteria renal sin pasar por el intersticio', 'De la pelvis renal hacia la cápsula'], 1, 'La reabsorción devuelve sustancias del líquido tubular al medio interno. La secreción opera en sentido opuesto.'),
      question(47, '¿Qué cotransportador recupera la mayor parte de la glucosa en los segmentos iniciales del túbulo proximal?', ['GLUT1 apical', 'SGLT1 basolateral', 'GLUT2 luminal', 'SGLT2 apical'], 3, 'SGLT2 está en la membrana luminal de S1–S2 y tiene alta capacidad de transporte.'),
      question(48, 'Si la carga filtrada de glucosa supera la capacidad máxima de reabsorción, ¿qué ocurre con el exceso?', ['Se excreta en la orina', 'Se reabsorbe por completo en el colector', 'Regresa al glomérulo por el uréter', 'Se transforma en sodio dentro del túbulo'], 0, 'La glucosa que supera la capacidad de transporte permanece en el líquido tubular y puede aparecer en la orina.'),
      question(55, '¿Qué hormona favorece la reabsorción de sodio en el sistema colector?', ['Péptido natriurético auricular', 'Paratohormona', 'Aldosterona', 'Eritropoyetina'], 2, 'La aldosterona aumenta la capacidad de reabsorber sodio en la nefrona distal y el colector.'),
      question(63, '¿Qué propiedad de la rama ascendente del asa ayuda a diluir el líquido tubular?', ['Reabsorbe agua y retiene sales', 'Permite la salida de solutos y es impermeable al agua', 'Secreta agua y sodio a la luz en igual proporción', 'Es impermeable al agua y a todos los solutos'], 1, 'El agua permanece en la luz mientras los solutos salen, lo que reduce la concentración del líquido tubular.')
    ]
  },
  {
    id: 'depuracion-v1', chapter: 4, title: 'Depuración renal', pages: [68, 74],
    summary: 'Calcula e interpreta la depuración de inulina, creatinina y PAH.',
    questions: [
      question(69, '¿Qué representa la depuración de un soluto?', ['El volumen de orina producido cada minuto', 'El volumen de sangre total que llega al riñón', 'El volumen de plasma del que se elimina ese soluto por unidad de tiempo', 'La concentración del soluto en el filtrado inicial'], 2, 'La depuración relaciona la cantidad excretada por unidad de tiempo con su concentración plasmática.'),
      question(70, 'Si U = 60 mg/dL, P = 2 mg/dL y el flujo de orina es 1,5 mL/min, ¿cuál es la depuración?', ['45 mL/min', '20 mL/min', '90 mL/min', '180 mL/min'], 0, 'Se aplica D = U × V ÷ P. El resultado es 60 × 1,5 ÷ 2 = 45 mL/min.'),
      question(71, '¿Por qué la depuración de inulina permite medir la TFG?', ['Se filtra y se reabsorbe por completo', 'Se secreta sin pasar por el glomérulo', 'Su eliminación depende solo del flujo urinario', 'Se filtra libremente y no se reabsorbe ni se secreta'], 3, 'La carga filtrada de inulina equivale a la excretada en la orina.'),
      question(72, '¿Por qué la depuración de creatinina puede sobreestimar la TFG?', ['Porque la creatinina se une por completo a proteínas plasmáticas', 'Porque parte de la creatinina también se secreta al túbulo', 'Porque la creatinina solo se elimina por el hígado', 'Porque el túbulo reabsorbe toda la creatinina filtrada'], 1, 'La pequeña secreción tubular se añade a la carga filtrada y eleva la depuración medida.'),
      question(71, 'A concentraciones bajas, ¿qué estima la depuración de PAH?', ['El flujo plasmático renal efectivo', 'El volumen de plasma filtrado en cada glomérulo', 'El hematocrito renal', 'La presión hidrostática capsular'], 0, 'La filtración y la secreción extraen gran parte del PAH en un paso por el riñón, por lo que su depuración aproxima el flujo plasmático efectivo.')
    ]
  },
  {
    id: 'hormonas-v1', chapter: 5, title: 'Función renal y hormonas', pages: [75, 94],
    summary: 'Distingue los efectos de la vasopresina, la aldosterona y otras hormonas.',
    questions: [
      question(77, '¿Qué cambio favorece la liberación de vasopresina?', ['Una caída de la osmolaridad plasmática', 'Una expansión del volumen circulante', 'Un aumento de la osmolaridad plasmática', 'Una reducción aislada de la concentración urinaria'], 2, 'La secreción de vasopresina aumenta con la osmolaridad plasmática y también ante una disminución importante del volumen circulante.'),
      question(82, '¿Qué canal incorpora la vasopresina a la membrana apical de las células principales del colector?', ['AQP2', 'AQP1', 'ENaC', 'NKCC2'], 0, 'La vasopresina aumenta la presencia de AQP2 en la membrana apical y facilita la reabsorción de agua.'),
      question(84, '¿Qué efecto renal corresponde a los péptidos natriuréticos?', ['Menor excreción de sodio', 'Mayor secreción de renina como efecto principal', 'Aumento de la reabsorción de agua como acción principal', 'Mayor excreción de sodio'], 3, 'La natriuresis consiste en aumentar la eliminación urinaria de sodio.'),
      question(86, '¿Dónde se produce la aldosterona?', ['En la neurohipófisis', 'En la zona glomerulosa de la corteza suprarrenal', 'En las células principales del colector', 'En la mácula densa'], 1, 'La zona glomerulosa suprarrenal produce aldosterona en respuesta, entre otros estímulos, a la angiotensina II.'),
      question(89, '¿Qué hace la PTH con la reabsorción proximal de fosfato?', ['La aumenta', 'La mantiene constante', 'La disminuye y favorece la fosfaturia', 'La transforma en reabsorción de sodio'], 2, 'La PTH reduce el cotransporte de sodio y fosfato en el túbulo proximal, lo que facilita la excreción de fosfato.')
    ]
  },
  {
    id: 'acido-base-v1', chapter: 6, title: 'Equilibrio ácido-base', pages: [95, 109],
    summary: 'Identifica amortiguadores, mecanismos renales y trastornos ácido-base.',
    questions: [
      question(98, '¿Cuál es el intervalo normal de pH sanguíneo que presenta el capítulo?', ['6,80–7,00', '7,35–7,45', '7,50–7,65', '7,00–7,20'], 1, 'El pH sanguíneo se mantiene en un intervalo estrecho alrededor de 7,40.'),
      question(100, '¿Qué componente del amortiguador bicarbonato puede regular rápidamente la respiración?', ['El fosfato', 'La albúmina', 'El amonio', 'El CO₂'], 3, 'La ventilación modifica la eliminación de CO₂, el componente volátil del sistema bicarbonato.'),
      question(103, '¿Qué secreta hacia la luz tubular la célula intercalar beta?', ['Bicarbonato', 'Sodio', 'Glucosa', 'CO₂'], 0, 'Las células intercalares beta secretan bicarbonato. Las de tipo alfa participan en la secreción de protones.'),
      question(104, '¿Cómo se calcula la excreción renal neta de ácido?', ['Acidez titulable menos amonio más bicarbonato urinario', 'Bicarbonato urinario más amonio menos acidez titulable', 'Acidez titulable más amonio menos bicarbonato urinario', 'Amonio menos acidez titulable menos bicarbonato urinario'], 2, 'El amonio y la acidez titulable eliminan ácido. El bicarbonato urinario se resta porque representa pérdida de base.'),
      question(106, 'Si se acumulan ácidos fijos y cae primariamente el bicarbonato plasmático, ¿qué trastorno se produce?', ['Acidosis metabólica', 'Alcalosis respiratoria', 'Alcalosis metabólica', 'Acidosis respiratoria'], 0, 'La acumulación de ácidos no volátiles consume bicarbonato y genera acidosis metabólica.')
    ]
  }
];

export function gradeWorkshop(workshop, answers) {
  const correct = workshop.questions.filter((question, index) => answers['q' + (index + 1)] === question.correct).length;
  const total = workshop.questions.length;
  return {correct, total, percent: Math.round(100 * correct / total)};
}
