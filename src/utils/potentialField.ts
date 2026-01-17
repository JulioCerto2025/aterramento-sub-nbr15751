
// Módulo para cálculo simplificado de campo de potencial para visualização (Heatmaps)
// Baseado em princípios da IEEE Std 80

/**
 * Gera uma matriz de potencial normalizado (0 a 1) para a superfície do solo.
 * Utiliza o método de superposição de fontes pontuais discretizadas ao longo dos condutores.
 * 
 * @param lx Comprimento da malha (m)
 * @param ly Largura da malha (m)
 * @param nx Número de condutores em X
 * @param ny Número de condutores em Y
 * @param depth Profundidade da malha (m)
 * @param rods Array de hastes {i, j} (índices da malha)
 * @param rodLength Comprimento da haste (m)
 * @param resolution Resolução da matriz de saída (ex: 50x50)
 * @param offset Margem extra ao redor da malha (m) para visualização
 */
export const calculatePotentialField = (
  lx: number,
  ly: number,
  nx: number,
  ny: number,
  depth: number,
  rods: {i: number, j: number}[],
  rodLength: number,
  resolution: number = 60,
  offset: number = 1.5
) => {
  const width = lx + 2 * offset
  const height = ly + 2 * offset
  
  // Matriz de saída
  const field: number[][] = Array(resolution).fill(0).map(() => Array(resolution).fill(0))
  
  // 1. Discretizar os condutores em "fontes de potencial"
  // Para visualização rápida, não precisamos de integração complexa.
  // Pontos a cada ~1-2 metros são suficientes.
  const sources: {x: number, y: number, z: number, weight: number}[] = []
  
  const stepX = lx / (nx - 1)
  const stepY = ly / (ny - 1)
  
  // Condutores Horizontais (ao longo de X)
  for (let j = 0; j < ny; j++) {
    const y = j * stepY
    // Adicionar pontos ao longo da linha
    const pointsInLine = Math.max(5, Math.floor(lx / 1.5)) // 1 ponto a cada 1.5m
    for (let k = 0; k <= pointsInLine; k++) {
      const x = (k / pointsInLine) * lx
      sources.push({ x, y, z: -depth, weight: 1.0 })
    }
  }

  // Condutores Verticais (ao longo de Y)
  for (let i = 0; i < nx; i++) {
    const x = i * stepX
    const pointsInLine = Math.max(5, Math.floor(ly / 1.5))
    for (let k = 0; k <= pointsInLine; k++) {
      const y = (k / pointsInLine) * ly
      sources.push({ x, y, z: -depth, weight: 1.0 })
    }
  }

  // Hastes (Fontes verticais profundas)
  // Modeladas como pontos extras mais profundos para "puxar" o potencial
  rods.forEach(rod => {
    const x = rod.i * stepX
    const y = rod.j * stepY
    // Discretizar haste
    const pointsInRod = 3
    for (let k = 1; k <= pointsInRod; k++) {
      const z = -depth - (k / pointsInRod) * rodLength
      sources.push({ x, y, z, weight: 1.5 }) // Peso maior para hastes
    }
  })

  // 2. Calcular Potencial na Superfície (z=0)
  // V(x,y) = Sum(1 / distance)
  let maxPotential = 0
  
  for (let r = 0; r < resolution; r++) {
    for (let c = 0; c < resolution; c++) {
      // Coordenadas reais do pixel na malha
      const px = -offset + (c / (resolution - 1)) * width
      const py = -offset + (r / (resolution - 1)) * height
      
      let potential = 0
      
      // Otimização: Apenas fontes próximas contribuem significativamente?
      // Não, potencial decai com 1/r, longo alcance importa.
      // Mas para visualização de "Touch", importa a forma local.
      
      for (const src of sources) {
        const dx = px - src.x
        const dy = py - src.y
        const dz = 0 - src.z // z=0 superfície
        const distSq = dx*dx + dy*dy + dz*dz
        // Evitar singularidade (não deve ocorrer pois z < 0)
        potential += src.weight / Math.sqrt(distSq)
      }
      
      field[r][c] = potential
      if (potential > maxPotential) maxPotential = potential
    }
  }

  // 3. Normalizar (0 a 1)
  // 1 = Potencial da Malha (GPR)
  // 0 = Potencial Remoto (Zero)
  // Na verdade, o valor calculado é proporcional ao potencial.
  // Vamos normalizar pelo máximo encontrado na superfície (que será logo acima dos condutores).
  if (maxPotential > 0) {
    for (let r = 0; r < resolution; r++) {
      for (let c = 0; c < resolution; c++) {
        field[r][c] = field[r][c] / maxPotential
      }
    }
  }

  return { matrix: field, width, height, offset }
}

/**
 * Calcula a matriz de Tensão de Toque
 * V_touch = GPR - V_soil
 * Na visualização normalizada: V_touch_norm = 1 - V_soil_norm
 * (Perto do condutor, V_soil ~ 1, V_touch ~ 0)
 * (Longe do condutor, V_soil < 1, V_touch > 0)
 */
export const calculateTouchMatrix = (potentialMatrix: number[][]) => {
  return potentialMatrix.map(row => row.map(val => 1 - val))
}

/**
 * Calcula a matriz de Tensão de Passo
 * V_step = Gradiente do Potencial (Magnitude da derivada espacial)
 */
export const calculateStepMatrix = (potentialMatrix: number[][]) => {
  const rows = potentialMatrix.length
  const cols = potentialMatrix[0].length
  const stepMatrix: number[][] = Array(rows).fill(0).map(() => Array(cols).fill(0))
  
  let maxStep = 0

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Diferença central simples
      const v = potentialMatrix[r][c]
      const v_right = (c < cols - 1) ? potentialMatrix[r][c+1] : v
      const v_down = (r < rows - 1) ? potentialMatrix[r+1][c] : v
      
      // Gradiente local aproximado
      const dx = Math.abs(v - v_right)
      const dy = Math.abs(v - v_down)
      const grad = Math.sqrt(dx*dx + dy*dy)
      
      stepMatrix[r][c] = grad
      if (grad > maxStep) maxStep = grad
    }
  }

  // Normalizar passo
  if (maxStep > 0) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        stepMatrix[r][c] = stepMatrix[r][c] / maxStep
      }
    }
  }
  
  return stepMatrix
}
