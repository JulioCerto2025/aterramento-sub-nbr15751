import { useState, useEffect } from 'react'
import { Zap, Activity, Layers, ShieldCheck, AlertTriangle, FileText } from 'lucide-react'
import { calculateEquivalentRadius, calculateApparentResistivity } from './utils/soilMath'
import { calculatePreliminaryResistanceA, calculatePreliminaryResistanceB, calculateSchwarzResistance, calculateKf, calculateDeratingFactor, calculateKi, calculateKm, calculateKs, calculateMeshTouchVoltage, calculateMeshStepVoltage, calculatePermissibleVoltages, VoltageDuration, calculateNBR14039TouchVoltage } from './utils/groundingMath'
import { calculatePotentialField, calculateTouchMatrix, calculateStepMatrix } from './utils/potentialField'
import { conductorMaterials, connectionTypes } from './utils/conductorData'

const parseNumberBR = (value: string): number => {
  if (!value) return NaN
  const normalized = value.replace(',', '.')
  return Number(normalized)
}

const formatNumberBR = (value: number | null | undefined, decimals = 2): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

function App() {
  // Global States
  const [activeStep, setActiveStep] = useState<number>(1)
  
  const [meshLx, setMeshLx] = useState<string>('50')
  const [meshLy, setMeshLy] = useState<string>('40')
  const [meshNx, setMeshNx] = useState<string>('11')
  const [meshNy, setMeshNy] = useState<string>('9')
  const [meshDepth, setMeshDepth] = useState<string>('0,5')
  const [meshGauge, setMeshGauge] = useState<string>('50')
  const [meshD, setMeshD] = useState<string>('7,98')

  const [soilType, setSoilType] = useState<string>('2-layer')
  const [rho1, setRho1] = useState<string>('')
  const [rho2, setRho2] = useState<string>('')
  const [layerDepth, setLayerDepth] = useState<string>('')
  const [apparentRho, setApparentRho] = useState<number | null>(null)

  // Step 3: Corrente de Malha
  const [shortCircuitCurrent, setShortCircuitCurrent] = useState<string>('')
  const [currentDivisionFactor, setCurrentDivisionFactor] = useState<string>('')
  
  // Step 4: Tensão Permissível (antigo 3/4) e Dimensionamento Condutor
  const [time, setTime] = useState<string>('')
  
  // Step 4: Dimensionamento (Novos Estados)
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('copper_soft')
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('exothermic')
  const [ambientTemp, setAmbientTemp] = useState<string>('30')
  const [useTotalCurrentForSizing, setUseTotalCurrentForSizing] = useState<boolean>(false)

  // Step 5: Tensões Permissíveis
  const [hasSurfaceLayer, setHasSurfaceLayer] = useState<boolean>(true)
  const [surfaceLayerResistivity, setSurfaceLayerResistivity] = useState<string>('3000') // Brita típica
  const [surfaceLayerThickness, setSurfaceLayerThickness] = useState<string>('0,1') // 10cm
  const [bodyWeight, setBodyWeight] = useState<'50' | '70'>('50')
  const [nbr14039Area, setNbr14039Area] = useState<'interna' | 'externa'>('interna')

  const [results, setResults] = useState<{
    vPasso: number | null
    vToque: number | null
    duration: VoltageDuration | null
  }>({ vPasso: null, vToque: null, duration: null })

  // New State for Resistance Selection
  const [selectedResistanceMethod, setSelectedResistanceMethod] = useState<'NBR' | 'IEEE'>('NBR')
  const [hasPerimeterRods, setHasPerimeterRods] = useState<boolean>(false)
  
  // Rods State (Hastes)
  const [meshRods, setMeshRods] = useState<{i: number, j: number}[]>([])
  const [rodLength, setRodLength] = useState<string>('2,4')
  const [rodDiameter, setRodDiameter] = useState<string>('12,7') // 1/2" ~ 12.7mm

  // Computed Values
  const getMeshCurrent = () => {
    const icc = parseNumberBR(shortCircuitCurrent)
    const factor = parseNumberBR(currentDivisionFactor)
    
    if (isNaN(icc) || isNaN(factor)) return null
    
    // Se fator for porcentagem (ex: 70), divide por 100. Se for decimal (0.7), usa direto?
    // Vamos assumir porcentagem se > 1, ou decimal se <= 1?
    // Melhor: Assumir porcentagem como padrão para inputs de usuário em engenharia, ou decimal.
    // O usuário disse "qual a parcela desse curto cicruito flui pela malha".
    // Vamos tratar como porcentagem (%) para ser mais explícito na UI.
    
    return icc * (factor / 100)
  }

  const getMeshArea = () => {
    const lx = parseNumberBR(meshLx)
    const ly = parseNumberBR(meshLy)
    if (isNaN(lx) || isNaN(ly)) return 0
    return lx * ly
  }

  const getTotalLength = () => {
    const lx = parseNumberBR(meshLx)
    const ly = parseNumberBR(meshLy)
    const nx = parseNumberBR(meshNx)
    const ny = parseNumberBR(meshNy)
    
    if (isNaN(lx) || isNaN(ly) || isNaN(nx) || isNaN(ny)) return 0

    // Assumindo visualização:
    // Nx = 11 (primeiro input) -> vemos 11 linhas verticais na imagem. Linhas verticais têm comprimento Ly.
    // Ny = 9 (segundo input) -> vemos 9 linhas horizontais na imagem. Linhas horizontais têm comprimento Lx.
    return (nx * ly) + (ny * lx)
  }

  // Effects
  useEffect(() => {
    const gauge = parseNumberBR(meshGauge)
    if (!isNaN(gauge) && gauge > 0) {
      const d = 2 * Math.sqrt(gauge / Math.PI)
      setMeshD(formatNumberBR(d, 2))
    }
  }, [meshGauge])

  useEffect(() => {
    // Recalcular Rho Aparente sempre que inputs mudarem
    if (activeStep === 1) {
      calculateRhoA()
    }
  }, [rho1, rho2, layerDepth, meshLx, meshLy, soilType])

  const toggleRod = (i: number, j: number) => {
    setMeshRods(prev => {
      const exists = prev.some(r => r.i === i && r.j === j)
      if (exists) {
        return prev.filter(r => !(r.i === i && r.j === j))
      }
      return [...prev, { i, j }]
    })
  }

  const calculateRhoA = () => {
    const r1 = parseNumberBR(rho1)
    const r2 = parseNumberBR(rho2)
    const h1 = parseNumberBR(layerDepth)
    const area = getMeshArea()
    
    // Se for homogêneo, rho_a = rho1
    if (soilType === 'homogeneous') {
      if (!isNaN(r1)) setApparentRho(r1)
      return
    }

    // Se faltar dados
    if (isNaN(r1) || isNaN(r2) || isNaN(h1) || isNaN(area)) {
      setApparentRho(null)
      return
    }

    const r = calculateEquivalentRadius(area)
    const rhoA = calculateApparentResistivity(r1, r2, h1, r)
    setApparentRho(rhoA)
  }

  // Resistência preliminar Equação (a)
  const getPreliminaryResistanceA = () => {
    const area = getMeshArea()
    const lt = getTotalLength()
    const rho = apparentRho || parseNumberBR(rho1)

    if (area <= 0 || lt <= 0 || !rho || rho <= 0) return null
    return calculatePreliminaryResistanceA(rho, area, lt)
  }

  // Resistência preliminar Equação (b)
  const getPreliminaryResistanceBValue = () => {
    const area = getMeshArea()
    const lt = getTotalLength()
    const h = parseNumberBR(meshDepth)
    const rho = apparentRho || parseNumberBR(rho1)

    if (area <= 0 || lt <= 0 || !rho || rho <= 0 || !h || h <= 0) return null
    return calculatePreliminaryResistanceB(rho, area, lt, h)
  }

  // Resistência detalhada IEEE 80 (Schwarz)
  const getIEEE80Resistance = () => {
    const area = getMeshArea()
    const lt = getTotalLength() // Length of conductors only (Lc)
    const lx = parseNumberBR(meshLx)
    const ly = parseNumberBR(meshLy)
    const h = parseNumberBR(meshDepth)
    const gauge = parseNumberBR(meshGauge)
    // Calcula diâmetro em mm a partir da seção (A = pi * r^2 => r = sqrt(A/pi), d = 2r)
    // Seção em mm² => Raio em mm
    const d_mm = (gauge > 0) ? 2 * Math.sqrt(gauge / Math.PI) : 0
    
    const rho = apparentRho || parseNumberBR(rho1)

    // Rods data
    const rL = parseNumberBR(rodLength)
    const rD = parseNumberBR(rodDiameter)
    const rods = {
      count: meshRods.length,
      length: rL > 0 ? rL : 2.4,
      diameter_mm: rD > 0 ? rD : 12.7
    }

    if (area > 0 && lt > 0 && h > 0 && rho > 0 && d_mm > 0 && lx > 0 && ly > 0) {
      return calculateSchwarzResistance(rho, area, lx, ly, lt, h, d_mm, rods)
    }
    return null
  }

  useEffect(() => {
    // Soil Resistivity below surface layer
    // Use apparentRho if available (representing the effective soil), otherwise rho1
    const rho = apparentRho || parseNumberBR(rho1) || 100
    
    const t = parseNumberBR(time)
    if (isNaN(t) || t <= 0) {
      setResults({ vPasso: null, vToque: null, duration: null })
      return
    }

    let rho_s = rho
    let cs = 1

    if (hasSurfaceLayer) {
      const rs = parseNumberBR(surfaceLayerResistivity)
      const hs = parseNumberBR(surfaceLayerThickness)
      if (!isNaN(rs) && !isNaN(hs)) {
        rho_s = rs
        cs = calculateDeratingFactor(rho, rho_s, hs)
      }
    }

    const permissible = calculatePermissibleVoltages(t, cs, rho_s, bodyWeight)
    setResults({
      vPasso: permissible.vPasso,
      vToque: permissible.vToque,
      duration: permissible.duration,
    })
  }, [time, hasSurfaceLayer, surfaceLayerResistivity, surfaceLayerThickness, bodyWeight, apparentRho, rho1])

  const renderStepContent = () => {
    if (activeStep === 2) {
      const lx = parseNumberBR(meshLx) || 0
      const ly = parseNumberBR(meshLy) || 0
      const nx = parseInt(meshNx) || 2
      const ny = parseInt(meshNy) || 2
      const lt = getTotalLength()
      
      // Margem para visualização
      const margin = Math.max(lx, ly) * 0.1
      const viewBox = `${-margin} ${-margin} ${lx + 2 * margin} ${ly + 2 * margin}`
      const preliminaryRa = getPreliminaryResistanceA()
      const preliminaryRb = getPreliminaryResistanceBValue()

      return (
        <div className="glass-soft p-6">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="border rounded-lg p-4 bg-gray-50 flex flex-col min-h-[500px] text-gray-900">
                <h3 className="text-sm font-semibold mb-2 uppercase tracking-wide text-center">Editor Visual de Malha</h3>
                <div className="flex-1 flex items-center justify-center border border-gray-200 bg-white rounded relative overflow-hidden">
                  {lx > 0 && ly > 0 ? (
                    <svg viewBox={viewBox} className="w-full h-full max-h-[500px]">
                      <rect x="0" y="0" width={lx} height={ly} fill="none" stroke="#e5e7eb" strokeWidth={Math.max(lx, ly) * 0.005} />
                      {Array.from({ length: nx }).map((_, i) => {
                        const x = nx > 1 ? (lx * i) / (nx - 1) : lx / 2
                        return (
                          <line
                            key={`v-${i}`}
                            x1={x} y1={0}
                            x2={x} y2={ly}
                            stroke="#d97706"
                            strokeWidth={Math.max(lx, ly) * 0.005}
                          />
                        )
                      })}
                      {Array.from({ length: ny }).map((_, i) => {
                        const y = ny > 1 ? (ly * i) / (ny - 1) : ly / 2
                        return (
                          <line
                            key={`h-${i}`}
                            x1={0} y1={y}
                            x2={lx} y2={y}
                            stroke="#d97706"
                            strokeWidth={Math.max(lx, ly) * 0.005}
                          />
                        )
                      })}
                      {Array.from({ length: nx }).map((_, i) =>
                        Array.from({ length: ny }).map((_, j) => {
                          const x = nx > 1 ? (lx * i) / (nx - 1) : lx / 2
                          const y = ny > 1 ? (ly * j) / (ny - 1) : ly / 2

                          const isRod = meshRods.some(r => r.i === i && r.j === j)
                          const nodeSize = Math.max(lx, ly) * 0.008
                          const hitAreaSize = Math.max(lx, ly) * 0.02

                          return (
                            <g
                              key={`n-${i}-${j}`}
                              onClick={() => toggleRod(i, j)}
                              style={{ cursor: 'pointer' }}
                              className="group"
                            >
                              <circle cx={x} cy={y} r={hitAreaSize} fill="transparent" />
                              {isRod && (
                                <rect
                                  x={x - nodeSize}
                                  y={y - nodeSize}
                                  width={nodeSize * 2}
                                  height={nodeSize * 2}
                                  fill="#10b981"
                                  stroke="#064e3b"
                                  strokeWidth={nodeSize * 0.2}
                                />
                              )}
                            </g>
                          )
                        })
                      )}
                      <line x1={0} y1={-margin / 2} x2={lx} y2={-margin / 2} stroke="#6b7280" strokeWidth={Math.max(lx, ly) * 0.002} markerEnd="url(#arrow)" markerStart="url(#arrow)" />
                      <text x={lx / 2} y={-margin / 1.5} textAnchor="middle" fill="#6b7280" fontSize={Math.max(lx, ly) * 0.04}>{formatNumberBR(lx, 2)}m</text>
                      <line x1={-margin / 2} y1={0} x2={-margin / 2} y2={ly} stroke="#6b7280" strokeWidth={Math.max(lx, ly) * 0.002} markerEnd="url(#arrow)" markerStart="url(#arrow)" />
                      <text x={-margin / 1.5} y={ly / 2} textAnchor="middle" fill="#6b7280" fontSize={Math.max(lx, ly) * 0.04} transform={`rotate(-90, ${-margin / 1.5}, ${ly / 2})`}>{formatNumberBR(ly, 2)}m</text>
                      <defs>
                        <marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
                          <path d="M0,0 L10,5 L0,10" fill="none" stroke="#6b7280" />
                        </marker>
                      </defs>
                    </svg>
                  ) : (
                    <div className="text-gray-400">Defina as dimensões para visualizar</div>
                  )}
                </div>
              </div>
            </div>

            {/* Inputs Geométricos (Direita) */}
            <div className="space-y-2">
              <h3 className="font-bold text-base text-amber-300 border-b pb-0.5">Inputs Geométricos</h3>
              
              {/* Dimensões */}
              <div>
                <label className="block text-xs font-semibold text-slate-100 mb-0.5">
                  Dimensões da malha (Comprimento x Largura)
                </label>
                <div className="flex items-center gap-1">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={meshLx}
                      onChange={(e) => setMeshLx(e.target.value)}
                      className="w-full pl-3 pr-8 py-0.5 border-2 border-amber-200 rounded-md bg-amber-50 focus:border-amber-400 focus:outline-none text-center font-semibold text-sm"
                      placeholder="50,0"
                    />
                    <span className="absolute right-2 top-1.5 text-slate-300 text-xs">m</span>
                  </div>
                  <span className="text-slate-200 font-semibold text-sm">x</span>
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={meshLy}
                      onChange={(e) => setMeshLy(e.target.value)}
                      className="w-full pl-3 pr-8 py-0.5 border-2 border-amber-200 rounded-md bg-amber-50 focus:border-amber-400 focus:outline-none text-center font-semibold text-sm"
                      placeholder="40,0"
                    />
                    <span className="absolute right-2 top-1.5 text-slate-300 text-xs">m</span>
                  </div>
                </div>
              </div>

            {/* Número de Condutores */}
              <div>
                <label className="block text-xs font-semibold text-slate-100 mb-0.5">
                  Número de condutores
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <input
                      type="number"
                      value={meshNx}
                      onChange={(e) => setMeshNx(e.target.value)}
                      className="w-full pl-7 pr-3 py-0.5 border-2 border-amber-300 rounded-md bg-slate-900/40 text-center text-sm text-slate-50 focus:outline-none focus:border-amber-400"
                      placeholder="11"
                    />
                    <span className="absolute left-2 top-1.5 text-[11px] font-semibold text-amber-200">
                      X:
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={meshNy}
                      onChange={(e) => setMeshNy(e.target.value)}
                      className="w-full pl-7 pr-3 py-0.5 border-2 border-amber-300 rounded-md bg-slate-900/40 text-center text-sm text-slate-50 focus:outline-none focus:border-amber-400"
                      placeholder="9"
                    />
                    <span className="absolute left-2 top-1.5 text-[11px] font-semibold text-amber-200">
                      Y:
                    </span>
                  </div>
                </div>
              </div>

              {/* Profundidade e Lt lado a lado */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-100 mb-0.5">
                    Prof. enterramento (H)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={meshDepth}
                      onChange={(e) => setMeshDepth(e.target.value)}
                      className="w-full pl-3 pr-8 py-0.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="0,5"
                    />
                    <span className="absolute right-2 top-1.5 text-slate-300 text-xs">m</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-100 mb-0.5">
                    Comp. total cond. (Lt)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={`${formatNumberBR(lt, 2)}m`}
                      className="w-full px-3 py-0.5 bg-gray-100 border border-gray-200 rounded-md text-gray-500 cursor-not-allowed font-mono text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Seção do Condutor */}
                <div>
                  <label className="block text-xs font-semibold text-slate-100 mb-0.5">
                    Seção (mm²)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                        value={meshGauge}
                        onChange={(e) => setMeshGauge(e.target.value)}
                        className="w-full pl-3 pr-8 py-0.5 border-2 border-amber-200 rounded-md text-sm focus:border-amber-400 focus:outline-none"
                      placeholder="50"
                    />
                    <span className="absolute right-2 top-1.5 text-slate-300 text-xs">mm²</span>
                  </div>
                </div>

                {/* Diâmetro do Condutor */}
                <div>
                  <label className="block text-xs font-semibold text-slate-100 mb-0.5">
                    Diâmetro (d)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={meshD}
                      readOnly
                      className="w-full pl-3 pr-10 py-0.5 bg-gray-100 border border-gray-200 rounded-md text-gray-600 text-sm focus:outline-none cursor-not-allowed"
                      placeholder="9"
                    />
                    <span className="absolute right-3 top-1.5 text-slate-300 text-xs">mm</span>
                  </div>
                </div>
              </div>

              {/* Hastes de Aterramento */}
              <div className="border-t border-white/20 pt-1.5 mt-1.5">
                <h3 className="font-bold text-sm text-amber-300 mb-1.5 flex justify-between items-center">
                  <span>Hastes de Aterramento</span>
                  <span className="text-xs bg-emerald-600 text-white px-2 py-1 rounded-full">{meshRods.length} inseridas</span>
                </h3>
                
                <div className="grid grid-cols-2 gap-2">
                   {/* Comprimento Haste */}
                   <div>
                     <label className="block text-xs font-semibold text-slate-100 mb-0.5">
                       Comprimento
                     </label>
                     <div className="relative">
                       <input
                         type="text"
                        value={rodLength}
                        onChange={(e) => setRodLength(e.target.value)}
                        className="w-full pl-3 pr-8 py-0.5 border-2 border-emerald-500/50 rounded-md bg-emerald-900/20 text-slate-100 text-sm focus:border-emerald-400 focus:outline-none"
                         placeholder="2,4"
                       />
                       <span className="absolute right-2 top-1.5 text-slate-300 text-xs">m</span>
                     </div>
                   </div>

                   {/* Diâmetro Haste */}
                   <div>
                     <label className="block text-xs font-semibold text-slate-100 mb-0.5">
                       Diâmetro
                     </label>
                     <div className="relative">
                       <input
                         type="text"
                        value={rodDiameter}
                        onChange={(e) => setRodDiameter(e.target.value)}
                        className="w-full pl-3 pr-8 py-0.5 border-2 border-emerald-500/50 rounded-md bg-emerald-900/20 text-slate-100 text-sm focus:border-emerald-400 focus:outline-none"
                         placeholder="12,7"
                       />
                       <span className="absolute right-2 top-1.5 text-slate-300 text-xs">mm</span>
                     </div>
                   </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
                  Adic./Remover Hastes - Clique nas interseções.
                </p>
              </div>

              <div className="border-t border-white/20 pt-2 mt-2">
                <h3 className="font-bold text-sm text-amber-300 mb-1.5 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  <span>Resistência de aterramento</span>
                </h3>

                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`relative flex flex-col p-3 cursor-pointer rounded-md border-2 text-xs transition-all ${
                      selectedResistanceMethod === 'NBR'
                        ? 'border-amber-400 bg-amber-500/10'
                        : 'border-slate-600/60 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <input
                        type="radio"
                        name="resistanceMethod"
                        value="NBR"
                        checked={selectedResistanceMethod === 'NBR'}
                        onChange={() => setSelectedResistanceMethod('NBR')}
                        className="h-3.5 w-3.5 text-amber-400 border-slate-500 focus:ring-amber-500"
                      />
                      <span className="font-semibold text-slate-50">
                        NBR <span className="text-slate-200">15751</span>
                      </span>
                    </div>
                    <div className="text-center leading-tight mb-1">
                      {(() => {
                        const value =
                          parseNumberBR(meshDepth) <= 0.25
                            ? preliminaryRa
                              ? formatNumberBR(preliminaryRa, 1)
                              : '-'
                            : preliminaryRb
                              ? formatNumberBR(preliminaryRb, 1)
                              : '-'
                        return (
                          <span className="font-bold text-sm text-amber-300">
                            {value} <span className="text-[11px] font-semibold">Ω</span>
                          </span>
                        )
                      })()}
                    </div>
                    <p className="text-[10px] text-slate-300">
                      Método Sverak.
                    </p>
                  </label>

                  <label
                    className={`relative flex flex-col p-3 cursor-pointer rounded-md border-2 text-xs transition-all ${
                      selectedResistanceMethod === 'IEEE'
                        ? 'border-amber-400 bg-amber-500/10'
                        : 'border-slate-600/60 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <input
                        type="radio"
                        name="resistanceMethod"
                        value="IEEE"
                        checked={selectedResistanceMethod === 'IEEE'}
                        onChange={() => setSelectedResistanceMethod('IEEE')}
                        className="h-3.5 w-3.5 text-amber-400 border-slate-500 focus:ring-amber-500"
                      />
                      <span className="font-semibold text-slate-50">
                        IEEE <span className="text-slate-200">80</span>
                      </span>
                    </div>
                    <div className="text-center leading-tight mb-1">
                      {(() => {
                        const res = getIEEE80Resistance()
                        const value = res ? formatNumberBR(res.resistance, 1) : '-'
                        return (
                          <span className="font-bold text-sm text-amber-300">
                            {value} <span className="text-[11px] font-semibold">Ω</span>
                          </span>
                        )
                      })()}
                    </div>
                    <p className="text-[10px] text-slate-300">
                      Método Schwarz.
                    </p>
                  </label>
                </div>

                
              </div>

            </div>
          </div>
        </div>
      )
    }

    if (activeStep === 1) {
      return (
        <div className="glass-soft p-6">
          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div className="glass-soft p-6 space-y-4">
              <h2 className="text-xl font-semibold mb-2 flex items-center gap-2 text-slate-50">
                <Layers className="w-5 h-5 text-amber-600" />
                1 - Modelagem do solo (Anexo A)
              </h2>
              <p className="text-slate-100 mb-4">
                Cálculo da resistividade aparente (ρₐ) associada ao sistema de aterramento.
              </p>

              <div>
                <label className="block text-sm font-medium text-slate-100 mb-1">
                  Tipo de modelo
                </label>
                <select 
                  value={soilType}
                  onChange={(e) => setSoilType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-500/60 bg-slate-900/40 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-100"
                >
                  <option value="homogeneous">Solo homogêneo</option>
                  <option value="2-layer">Duas camadas</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-100 mb-1">
                  Resistividade da 1ª Camada - ρ₁ (Ω.m)
                </label>
                <input
                  type="text"
                  value={rho1}
                  onChange={(e) => setRho1(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-500/60 bg-slate-900/40 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-100 placeholder-slate-400"
                  placeholder="Ex: 100,0"
                />
              </div>

              {soilType === '2-layer' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-100 mb-1">
                      Resistividade da 2ª Camada - ρ₂ (Ω.m)
                    </label>
                    <input
                      type="text"
                      value={rho2}
                      onChange={(e) => setRho2(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-500/60 bg-slate-900/40 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-100 placeholder-slate-400"
                      placeholder="Ex: 50,0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-100 mb-1">
                      Profundidade da 1ª Camada - h₁ (m)
                    </label>
                    <input
                      type="text"
                      value={layerDepth}
                      onChange={(e) => setLayerDepth(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-500/60 bg-slate-900/40 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-100 placeholder-slate-400"
                      placeholder="Ex: 2,0"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="glass-soft p-6">
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 text-gray-900">
                <h3 className="font-semibold text-gray-900 mb-4">Resultados da Modelagem</h3>
                
                <div className="space-y-3">
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-600">Resistividade Aparente (ρₐ)</span>
                    <span className="font-bold text-lg text-amber-700">
                      {apparentRho ? `${formatNumberBR(apparentRho, 2)} Ω.m` : '-'}
                    </span>
                  </div>
                  
                  {soilType === '2-layer' && apparentRho && (
                    <div className="mt-4 text-xs text-gray-500">
                      Calculado via série de imagens (Burgsdorf-Yakobs) conforme NBR 15751 Anexo A.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (activeStep === 3) {
      return (
        <div className="glass-soft p-6">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-slate-50">
            <Zap className="w-5 h-5 text-yellow-500" />
            3 - Cálculo da Corrente da Malha
          </h2>
          
          <div className="max-w-2xl mx-auto">
            <div className="space-y-6">
              <p className="text-slate-100">
                Informe a corrente de curto-circuito total e o fator de divisão para calcular a parcela que efetivamente percorre a malha de terra (Im).
              </p>

              <div>
                <label className="block text-sm font-semibold text-slate-100 mb-1">
                  Corrente de Curto-Circuito Total (Icc)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={shortCircuitCurrent}
                    onChange={(e) => setShortCircuitCurrent(e.target.value)}
                    className="w-full pl-3 pr-10 py-2 border-2 border-slate-500/60 bg-slate-900/40 rounded-md focus:border-amber-400 focus:outline-none text-slate-100 placeholder-slate-400"
                    placeholder="Ex: 10,0"
                  />
                  <span className="absolute right-3 top-2 text-gray-500 text-sm font-semibold">kA</span>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-slate-100 mb-1">
                    Fator de Divisão de Corrente (Sf)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={currentDivisionFactor}
                      onChange={(e) => setCurrentDivisionFactor(e.target.value)}
                      className="w-full pl-3 pr-10 py-2 border-2 border-slate-500/60 bg-slate-900/40 rounded-md focus:border-amber-400 focus:outline-none text-slate-100 placeholder-slate-400"
                      placeholder="Ex: 70"
                    />
                    <span className="absolute right-3 top-2 text-gray-500 text-sm font-semibold">%</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Percentual da Icc que circula na malha (Im = Icc × Sf / 100).
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-100 mb-1">
                    Tempo de Duração da Falta (t)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full pl-3 pr-10 py-2 border-2 border-slate-500/60 bg-slate-900/40 rounded-md focus:border-amber-400 focus:outline-none text-slate-100 placeholder-slate-400"
                      placeholder="Ex: 0,5"
                    />
                    <span className="absolute right-3 top-2 text-gray-500 text-sm font-semibold">s</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Tempo de falta usado no dimensionamento e nas tensões.
                  </p>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                 <h4 className="font-semibold text-yellow-900 mb-2 text-sm">Resultado: Corrente de Malha (Im)</h4>
                 <div className="flex items-end gap-2">
                   <span className="text-3xl font-bold text-yellow-800">
                     {getMeshCurrent() !== null ? formatNumberBR(getMeshCurrent(), 2) : '-'}
                   </span>
                   <span className="text-yellow-700 font-medium mb-1">kA</span>
                 </div>
                 <p className="text-xs text-yellow-700 mt-2">
                   Corrente que efetivamente circula pela malha após a divisão com os cabos para-raios/neutro. Será usada no dimensionamento e no cálculo dos potenciais (GPR).
                 </p>
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (activeStep === 4) {
      // Obter dados do material e conexão selecionados
      const material = conductorMaterials.find(m => m.id === selectedMaterialId)
      const connection = connectionTypes.find(c => c.id === selectedConnectionId)
      
      const t = parseNumberBR(time)
      const ta = parseNumberBR(ambientTemp)
      // Corrente para dimensionamento: Im (Malha) ou Icc (Total)
      const currentForSizing = useTotalCurrentForSizing 
        ? parseNumberBR(shortCircuitCurrent) 
        : getMeshCurrent()

      // Cálculo da Seção Mínima
      let minSection = 0
      let calculatedKf = 0
      
      if (material && connection && t > 0 && ta < connection.maxTemp && currentForSizing && currentForSizing > 0) {
        // Se a temperatura máxima da conexão for menor que a fusão do material, usa a da conexão
        // Se a conexão suporta mais que o material (ex: solda exotérmica em alumínio), limita ao material
        const tm = Math.min(connection.maxTemp, material.tFusion)
        
        calculatedKf = calculateKf(
          material.alpha20,
          material.rho20,
          material.tcap,
          tm,
          ta
        )

        // S = If * Kf * sqrt(t)
        // Se If estiver em kA e Kf em unidade compatível...
        // O Kf retornado por nossa função já considera as unidades para resultar mm².
        minSection = currentForSizing * calculatedKf * Math.sqrt(t)
      }

      return (
        <div className="glass-soft p-6">
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Coluna da Esquerda: Inputs */}
            <div className="space-y-6">
              {/* Seleção de Material */}
              <div>
                <label className="block text-sm font-semibold text-slate-100 mb-1">
                  Material do Condutor (Tabela 1)
                </label>
                <select
                  value={selectedMaterialId}
                  onChange={(e) => setSelectedMaterialId(e.target.value)}
                  className="w-full p-2 border-2 border-gray-200 rounded-md bg-white focus:border-amber-500 focus:outline-none"
                >
                  {conductorMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Seleção de Conexão */}
              <div>
                <label className="block text-sm font-semibold text-slate-100 mb-1">
                  Tipo de Conexão (Tabela 2)
                </label>
                <select
                  value={selectedConnectionId}
                  onChange={(e) => setSelectedConnectionId(e.target.value)}
                  className="w-full p-2 border-2 border-gray-200 rounded-md bg-white focus:border-amber-500 focus:outline-none"
                >
                  {connectionTypes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Tm: {c.maxTemp}°C)
                    </option>
                  ))}
                </select>
              </div>

              {/* Temperatura Ambiente */}
              <div>
                <label className="block text-sm font-semibold text-slate-100 mb-1">
                  Temperatura Ambiente (Ta)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={ambientTemp}
                    onChange={(e) => setAmbientTemp(e.target.value)}
                    className="w-full pl-3 pr-10 py-2 border-2 border-slate-500/60 bg-slate-900/40 rounded-md focus:border-amber-400 focus:outline-none text-slate-100 placeholder-slate-400"
                    placeholder="40"
                  />
                  <span className="absolute right-3 top-2 text-gray-500 text-sm font-semibold">°C</span>
                </div>
              </div>

              {/* Opção de Corrente */}
              <div className="p-4 bg-gray-50 rounded border border-gray-200 text-gray-900">
                 <label className="flex items-start gap-3 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={useTotalCurrentForSizing}
                      onChange={(e) => setUseTotalCurrentForSizing(e.target.checked)}
                      className="mt-1 h-4 w-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                    />
                    <div>
                      <span className="block text-sm font-semibold text-gray-700">Usar Corrente de Curto Total (Icc)</span>
                    </div>
                 </label>
              </div>
            </div>

            {/* Coluna da Direita: Resultados */}
            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 flex flex-col justify-start items-stretch text-gray-900">
              <h3 className="text-lg font-semibold text-gray-800 mb-6 text-center">Seção Mínima Calculada</h3>
              
              <div className="mb-6 text-center">
                <span className="text-5xl font-bold text-amber-900 block">
                  {minSection > 0 ? formatNumberBR(minSection, 2) : '-'}
                </span>
                <span className="text-xl text-amber-700 font-medium">mm²</span>
              </div>

              {minSection > 0 && (
                <div className="w-full space-y-4">
                  <div className={`p-4 rounded-lg border-l-4 text-left ${
                    parseNumberBR(meshGauge) >= minSection 
                      ? 'bg-green-50 border-green-500' 
                      : 'bg-red-50 border-red-500'
                  }`}>
                    <h4 className={`font-bold ${
                      parseNumberBR(meshGauge) >= minSection ? 'text-green-800' : 'text-red-800'
                    } flex items-center gap-2`}>
                      {parseNumberBR(meshGauge) >= minSection 
                        ? <><ShieldCheck className="w-5 h-5"/> Aprovado</> 
                        : <><AlertTriangle className="w-5 h-5"/> Atenção: Seção Insuficiente</>
                      }
                    </h4>
                    <p className="text-sm mt-1 text-gray-700">
                      A seção informada na geometria ({meshGauge} mm²) é {parseNumberBR(meshGauge) >= minSection ? 'maior' : 'menor'} que a mínima necessária.
                    </p>
                  </div>

                </div>
              )}
            </div>
          </div>
        </div>
      )
    }

    if (activeStep === 5) {
      const tFault = parseNumberBR(time)
      const nbrTouch = !isNaN(tFault) && tFault > 0 ? calculateNBR14039TouchVoltage(tFault, nbr14039Area) : null
      return (
        <div className="glass-soft p-6">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              {/* Peso do Corpo */}
              <div>
                <label className="block text-sm font-semibold text-slate-100 mb-1">
                  Peso Corpo Consid. (Afluência de Público/Acesso Restrito)
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      checked={bodyWeight === '50'} 
                      onChange={() => setBodyWeight('50')}
                      className="text-amber-600 focus:ring-amber-500"
                    />
                    <span>50 kg</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      checked={bodyWeight === '70'} 
                      onChange={() => setBodyWeight('70')}
                      className="text-amber-600 focus:ring-amber-500"
                    />
                    <span>70 kg</span>
                  </label>
                </div>
              </div>

              {/* Camada Superficial */}
              <div className="p-3 bg-gray-50 rounded border border-gray-200">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input 
                    type="checkbox"
                    checked={hasSurfaceLayer}
                    onChange={(e) => setHasSurfaceLayer(e.target.checked)}
                    className="h-4 w-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                  />
                  <span className="font-semibold text-gray-700">Utilizar Camada Superficial</span>
                </label>

                {hasSurfaceLayer && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-4 border-l border-gray-200">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Resist. Camada Superf. (ρs)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={surfaceLayerResistivity}
                          onChange={(e) => setSurfaceLayerResistivity(e.target.value)}
                          className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                          placeholder="3000"
                        />
                        <span className="absolute right-3 top-2 text-gray-500 text-sm">Ω.m</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Espessura da Camada (hs)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={surfaceLayerThickness}
                          onChange={(e) => setSurfaceLayerThickness(e.target.value)}
                          className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                          placeholder="0,1"
                        />
                        <span className="absolute right-3 top-2 text-gray-500 text-sm">m</span>
                      </div>
                    </div>
                  </div>
                )}
                {!hasSurfaceLayer && (
                  <p className="text-sm text-gray-500 italic">
                    Será utilizada a resistividade do solo da camada superior (ρ = {rho1 || '-'} Ω.m)
                  </p>
                )}
              </div>

              <div className="p-4 bg-amber-50 rounded border border-amber-100 text-sm mt-3 text-left">
                <p className="text-amber-800">
                  <strong>Dados da Falta (Etapa 3):</strong>
                  <br />
                  Corrente de malha (Im):{' '}
                  <strong>
                    {getMeshCurrent() !== null ? `${formatNumberBR(getMeshCurrent() || 0, 2)} kA` : '-'}
                  </strong>
                  <br />
                  Tempo de duração (t):{' '}
                  <strong>{time ? `${formatNumberBR(parseNumberBR(time), 2)} s` : '-'}</strong>
                </p>
              </div>

            <div className="p-4 bg-slate-900/30 rounded border border-slate-700 text-xs text-slate-100">
              <div className="overflow-x-auto rounded border border-slate-700/70 bg-slate-950/60">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-slate-900/90">
                    <tr className="border-b border-slate-700/80">
                      <th rowSpan={2} className="py-1.5 px-3 text-left font-semibold align-middle">
                        Material
                      </th>
                      <th colSpan={2} className="py-1.5 px-3 text-center font-semibold">
                        Resistividade (Ω·m)
                      </th>
                    </tr>
                    <tr className="border-b border-slate-700/80">
                      <th className="py-1.5 px-3 text-center font-semibold border-l border-slate-700/80">
                        seco
                      </th>
                      <th className="py-1.5 px-3 text-center font-semibold border-l border-slate-700/80">
                        molhado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/80">
                    <tr>
                      <td className="py-1.5 px-3">Brita nº 1, 2 ou 3</td>
                      <td className="py-1.5 px-3 text-center border-l border-slate-700/80">–</td>
                      <td className="py-1.5 px-3 text-center border-l border-slate-700/80">3 000</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3">Concreto</td>
                      <td className="py-1.5 px-3 text-center border-l border-slate-700/80">
                        1 200 a 280 000
                      </td>
                      <td className="py-1.5 px-3 text-center border-l border-slate-700/80">21 a 100</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3">Asfalto</td>
                      <td className="py-1.5 px-3 text-center border-l border-slate-700/80">
                        2 × 10⁶ a 30 × 10⁶
                      </td>
                      <td className="py-1.5 px-3 text-center border-l border-slate-700/80">
                        10 × 10³ a 6 × 10⁶
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-center text-slate-300">
                Tabela 5 – Resistividade do material de recobrimento (ρs)
              </p>
            </div>

            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col justify-start text-gray-900 self-start">
              <h3 className="text-lg font-semibold text-gray-800 mb-3 text-center">Limites Calculados</h3>
              
              <div className="space-y-4">
                {/* NBR 15751 / IEEE 80 Section */}
                <div>
                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <span className="h-px w-8 bg-orange-200"></span>
                    <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">NBR 15751 / IEEE 80</span>
                    <span className="h-px w-8 bg-orange-200"></span>
                  </div>

                  <div className="space-y-3">
                    <div className="text-center">
                      <p className="text-sm text-gray-600 mb-1 font-medium">
                        Tensão de Toque Máxima (Vtoque){' '}
                        {results.duration === 'longa' ? '(longa duração)' : results.duration === 'curta' ? '(curta duração)' : ''}
                      </p>
                      <div className="flex items-baseline justify-center gap-1.5">
                        <span className="text-4xl font-bold text-amber-900">
                          {results.vToque ? formatNumberBR(results.vToque, 0) : '-'}
                        </span>
                        <span className="text-xl text-amber-700">V</span>
                      </div>
                    </div>

                    <div className="text-center">
                      <p className="text-sm text-gray-600 mb-1 font-medium">
                        Tensão de Passo Máxima (Vpasso){' '}
                        {results.duration === 'longa' ? '(longa duração)' : results.duration === 'curta' ? '(curta duração)' : ''}
                      </p>
                      <div className="flex items-baseline justify-center gap-1.5">
                        <span className="text-4xl font-bold text-amber-900">
                          {results.vPasso ? formatNumberBR(results.vPasso, 0) : '-'}
                        </span>
                        <span className="text-xl text-amber-700">V</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-gray-300"></div>
                </div>

                {/* NBR 14039 Section */}
                <div className="text-center opacity-80 hover:opacity-100 transition-opacity">
                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">| NBR 14039 (comparativo)</span>
                  </div>
                  
                  <p className="text-sm text-gray-400 mb-1">
                    Tensão de Toque Presumida (Anexo A)
                    <br/>
                    <span className="text-xs">
                    {nbr14039Area === 'interna' ? '(situação 1 – área interna)' : '(situação 2 – área externa)'}
                    </span>
                  </p>
                  <div className="flex items-baseline justify-center gap-1.5">
                    <span className="text-3xl font-bold text-gray-500">
                      {nbrTouch ? formatNumberBR(nbrTouch, 0) : '-'}
                    </span>
                    <span className="text-xl text-gray-400">V</span>
                  </div>
                </div>
                
                <div className="p-4 bg-slate-900/40 rounded border border-slate-600 text-sm text-slate-100 mt-4">
                  <div className="flex flex-col gap-2 text-left">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        className="text-amber-500 focus:ring-amber-400"
                        checked={nbr14039Area === 'interna'}
                        onChange={() => setNbr14039Area('interna')}
                      />
                      <span>
                        Situação 1 – Área interna (curva L)
                        <span className="ml-2 text-xs text-slate-300 font-normal">(50 V)</span>
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        className="text-amber-500 focus:ring-amber-400"
                        checked={nbr14039Area === 'externa'}
                        onChange={() => setNbr14039Area('externa')}
                      />
                      <span>
                        Situação 2 – Área externa (curva Lp)
                        <span className="ml-2 text-xs text-slate-300 font-normal">(25 V)</span>
                      </span>
                    </label>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )
    }

    if (activeStep === 7) {
      // 1. Recalculate Voltages (Logic from Step 6)
      const resistance = selectedResistanceMethod === 'NBR' 
        ? (parseNumberBR(meshDepth) <= 0.25 ? getPreliminaryResistanceA() : getPreliminaryResistanceBValue())
        : getIEEE80Resistance()?.resistance

      // Retrieve Inputs for Mesh Voltage Calculations
      const lx = parseNumberBR(meshLx)
      const ly = parseNumberBR(meshLy)
      const nx = parseInt(meshNx)
      const ny = parseInt(meshNy)
      const h = parseNumberBR(meshDepth)
      const d_mm = parseNumberBR(meshD)
      const d = d_mm / 1000 // convert to meters
      const rho = apparentRho || parseNumberBR(rho1) || 100
      const im_kA = getMeshCurrent() || 0
      const im = im_kA * 1000 // convert to Amperes
      const lt = getTotalLength()

      // Calculate Derived Geometric Parameters
      // n (Effective number of parallel conductors)
      let n = 1
      if (lx > 0 && ly > 0 && nx > 0 && ny > 0) {
         const lc = (nx * ly) + (ny * lx)
         const lp = 2 * (lx + ly)
         n = lc / (lp / 2)
      }
      
      // D (Average Spacing)
      let D = 0
      if (nx > 1 && ny > 1) {
        const dx = lx / (nx - 1)
        const dy = ly / (ny - 1)
        D = (dx + dy) / 2
      }

      const kiBase = calculateKi(n)
      const ki = hasPerimeterRods ? 1 : kiBase
      const km = calculateKm(D, h, d, n, hasPerimeterRods) 
      const ks = calculateKs(D, h, n)

      // Calculate Voltages
      const vMeshTouch = calculateMeshTouchVoltage(rho, im, km, ki, lt)
      const vMeshStep = calculateMeshStepVoltage(rho, im, ks, ki, lt)

      const gpr = (resistance && im_kA) 
        ? resistance * im // R * I (Volts)
        : null
      
      // Validation Logic
      const isGPRSafe = (gpr !== null && results.vToque !== null) ? gpr < results.vToque : false
      const isTouchSafe = (results.vToque !== null) ? vMeshTouch < results.vToque : false
      const isStepSafe = (results.vPasso !== null) ? vMeshStep < results.vPasso : false
      const isSafe = isGPRSafe || (isTouchSafe && isStepSafe)

      const t14039 = parseNumberBR(time)
      const vTouchNBR14039 = !isNaN(t14039) && t14039 > 0 ? calculateNBR14039TouchVoltage(t14039, nbr14039Area) : null

      // Get Material Names and Objects
      const material = conductorMaterials.find(m => m.id === selectedMaterialId)
      const connection = connectionTypes.find(c => c.id === selectedConnectionId)
      const materialName = material?.name || selectedMaterialId
      const connectionName = connection?.name || selectedConnectionId

      // Calculate Min Section (Logic from Step 4)
      const t = parseNumberBR(time)
      const ta = parseNumberBR(ambientTemp)
      const currentForSizing = useTotalCurrentForSizing 
        ? parseNumberBR(shortCircuitCurrent) 
        : getMeshCurrent()

      let minSection = 0
      if (material && connection && t > 0 && currentForSizing && currentForSizing > 0) {
        const tm = Math.min(connection.maxTemp, material.tFusion)
        const calculatedKf = calculateKf(
          material.alpha20,
          material.rho20,
          material.tcap,
          tm,
          ta
        )
        minSection = currentForSizing * calculatedKf * Math.sqrt(t)
      }

      return (
        <div className="glass-soft p-8 max-w-4xl mx-auto print:bg-white print:text-black print:p-0 print:shadow-none">
          <div className="flex justify-between items-center mb-8 print:hidden">
            <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-50">
              <FileText className="w-6 h-6 text-yellow-400" />
              7 - Relatório Final de Dimensionamento
            </h2>
            <button 
              onClick={() => window.print()}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Imprimir Relatório
            </button>
          </div>

          <div className="space-y-8 print:space-y-6 text-gray-800 bg-white/95 p-8 rounded-lg shadow-xl print:shadow-none print:p-0">
            
            {/* Header do Relatório */}
            <div className="text-center border-b-2 border-gray-800 pb-4 mb-8">
              <h1 className="text-3xl font-bold uppercase tracking-wide mb-2">Relatório de Malha de Terra</h1>
              <p className="text-gray-600">Dimensionamento conforme NBR 15751 / IEEE 80</p>
              <p className="text-sm text-gray-500 mt-2">Data: {new Date().toLocaleDateString('pt-BR')}</p>
            </div>

            {/* 1. Resumo da Validação */}
            <div className={`p-4 rounded-lg border-2 text-center ${isSafe ? 'bg-green-100 border-green-600 text-green-900' : 'bg-red-100 border-red-600 text-red-900'}`}>
              <h3 className="text-xl font-bold uppercase mb-1">Resultado da Validação</h3>
              <p className="font-semibold text-lg">{isSafe ? 'APROVADO PARA CONSTRUÇÃO' : 'REPROVADO - NECESSÁRIO REVISÃO'}</p>
              <p className="text-sm mt-1">
                {isSafe 
                  ? 'As tensões de passo e toque calculadas estão dentro dos limites admissíveis.' 
                  : 'As tensões calculadas excedem os limites de segurança permitidos.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:grid-cols-2">
              
              {/* 2. Dados de Entrada e Solo */}
              <section>
                <h3 className="text-lg font-bold border-b border-gray-300 mb-3 pb-1 text-amber-900">1. Parâmetros de Projeto e Solo</h3>
                <ul className="text-sm space-y-1">
                  <li><strong>Corrente de Curto-Circuito:</strong> {shortCircuitCurrent} kA</li>
                  <li><strong>Divisão de Corrente:</strong> {currentDivisionFactor || '0'} %</li>
                  <li><strong>Tempo de Duração (t):</strong> {time} s</li>
                  <li><strong>Modelo de Solo:</strong> {soilType === '2-layer' ? '2 Camadas' : 'Uniforme'}</li>
                  {soilType === '2-layer' && (
                    <>
                      <li><strong>Resistividade Camada 1 (ρ1):</strong> {rho1} Ω.m</li>
                      <li><strong>Resistividade Camada 2 (ρ2):</strong> {rho2} Ω.m</li>
                      <li><strong>Profundidade Camada 1 (h):</strong> {layerDepth} m</li>
                    </>
                  )}
                  <li><strong>Resistividade Aparente (ρa):</strong> {apparentRho ? formatNumberBR(apparentRho, 2) : '-'} Ω.m</li>
                  <li><strong>Camada Superficial (Brita):</strong> {hasSurfaceLayer ? `Sim (${formatNumberBR(parseNumberBR(surfaceLayerThickness)*100, 0)} cm, ${surfaceLayerResistivity} Ω.m)` : 'Não'}</li>
                </ul>
              </section>

              {/* 3. Materiais e Condutores */}
              <section>
                <h3 className="text-lg font-bold border-b border-gray-300 mb-3 pb-1 text-amber-900">2. Materiais e Condutores</h3>
                <ul className="text-sm space-y-1">
                  <li><strong>Material do Condutor:</strong> {materialName}</li>
                  <li><strong>Tipo de Conexão/Emenda:</strong> {connectionName}</li>
                  <li><strong>Temperatura Ambiente:</strong> {ambientTemp} °C</li>
                  <li className="mt-2 pt-2 border-t border-gray-200">
                    <strong>Seção Mínima Calculada:</strong> {formatNumberBR(minSection, 2)} mm²
                  </li>
                  <li>
                    <strong>Seção Adotada:</strong> <span className={parseNumberBR(meshGauge) >= minSection ? 'text-green-700 font-bold' : 'text-red-600 font-bold'}>{meshGauge} mm²</span>
                  </li>
                </ul>
              </section>
            </div>

            {/* 4. Geometria da Malha (Desenhos) */}
            <section>
              <h3 className="text-lg font-bold border-b border-gray-300 mb-3 pb-1 text-amber-900">3. Geometria da Malha (Desenho Esquemático)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 text-sm space-y-1">
                   <p><strong>Dimensões:</strong> {meshLx}m x {meshLy}m</p>
                   <p><strong>Malha (Grid):</strong> {meshNx} x {meshNy} condutores</p>
                   <p><strong>Profundidade:</strong> {meshDepth} m</p>
                   <p><strong>Espaçamento Médio:</strong> {formatNumberBR(D, 2)} m</p>
                   <p><strong>Comprimento Total (Lt):</strong> {formatNumberBR(lt, 0)} m</p>
                   <p><strong>Hastes na Periferia:</strong> {hasPerimeterRods ? 'Sim' : 'Não'}</p>
                </div>
                <div className="md:col-span-2 flex justify-center items-center border rounded bg-gray-50 p-4 h-48 print:h-40 print:border-gray-300">
                  {/* Miniatura Simplificada da Malha */}
                  <svg width="100%" height="100%" viewBox={`0 0 ${lx} ${ly}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
                     <rect x="0" y="0" width={lx} height={ly} fill="none" stroke="#cbd5e1" strokeWidth={Math.max(lx, ly)/100} />
                     {/* Horizontal lines */}
                     {Array.from({ length: ny }).map((_, i) => (
                        <line 
                          key={`h-${i}`} 
                          x1="0" 
                          y1={i * (ly / (ny - 1))} 
                          x2={lx} 
                          y2={i * (ly / (ny - 1))} 
                          stroke="#3b82f6" 
                          strokeWidth={Math.max(lx, ly)/200}
                        />
                     ))}
                     {/* Vertical lines */}
                     {Array.from({ length: nx }).map((_, i) => (
                        <line 
                          key={`v-${i}`} 
                          x1={i * (lx / (nx - 1))} 
                          y1="0" 
                          x2={i * (lx / (nx - 1))} 
                          y2={ly} 
                          stroke="#3b82f6" 
                          strokeWidth={Math.max(lx, ly)/200}
                        />
                     ))}
                  </svg>
                </div>
              </div>
            </section>

            {/* 5. Tabela de Tensões */}
            <section>
              <h3 className="text-lg font-bold border-b border-gray-300 mb-3 pb-1 text-amber-900">4. Análise de Tensões (Suportáveis vs. Presentes)</h3>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b-2 border-gray-300">
                      <th className="py-2 px-3 font-bold text-gray-700">Parâmetro</th>
                      <th className="py-2 px-3 font-bold text-gray-700 text-right">Limite Admissível (V)</th>
                      <th className="py-2 px-3 font-bold text-gray-700 text-right">Valor Calculado (V)</th>
                      <th className="py-2 px-3 font-bold text-gray-700 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {/* GPR */}
                    <tr>
                      <td className="py-2 px-3 font-medium">GPR (Elevação de Potencial)</td>
                      <td className="py-2 px-3 text-right text-gray-500">-</td>
                      <td className="py-2 px-3 text-right font-bold">{gpr ? formatNumberBR(gpr, 0) : '-'}</td>
                      <td className="py-2 px-3 text-center">
                         {isGPRSafe && <span className="inline-block px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs font-bold">Seguro (&lt; Vtoque)</span>}
                      </td>
                    </tr>
                    
                    {/* Tensão de Toque */}
                    <tr className={isTouchSafe ? 'bg-green-50/50' : 'bg-red-50/50'}>
                      <td className="py-2 px-3 font-medium">Tensão de Toque</td>
                      <td className="py-2 px-3 text-right">{results.vToque ? formatNumberBR(results.vToque, 0) : '-'}</td>
                      <td className="py-2 px-3 text-right font-bold">{formatNumberBR(vMeshTouch, 0)}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${isTouchSafe ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {isTouchSafe ? 'APROVADO' : 'REPROVADO'}
                        </span>
                      </td>
                    </tr>

                    <tr className="bg-gray-50/50 text-gray-500">
                      <td className="py-2 px-3 font-medium text-gray-400">
                        <span className="block text-[10px] uppercase tracking-wider text-gray-300 mb-0.5">| Comparativo</span>
                        Tensão de Toque Presumida NBR 14039
                        <span className="block text-xs font-normal mt-0.5">
                        {nbr14039Area === 'interna' ? '(situação 1 – área interna)' : '(situação 2 – área externa)'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-gray-400">
                        {vTouchNBR14039 ? formatNumberBR(vTouchNBR14039, 0) : '-'}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-300">-</td>
                      <td className="py-2 px-3 text-center text-xs text-gray-400 italic">Apenas referência</td>
                    </tr>

                    {/* Tensão de Passo */}
                    <tr className={isStepSafe ? 'bg-green-50/50' : 'bg-red-50/50'}>
                      <td className="py-2 px-3 font-medium">Tensão de Passo</td>
                      <td className="py-2 px-3 text-right">{results.vPasso ? formatNumberBR(results.vPasso, 0) : '-'}</td>
                      <td className="py-2 px-3 text-right font-bold">{formatNumberBR(vMeshStep, 0)}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${isStepSafe ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {isStepSafe ? 'APROVADO' : 'REPROVADO'}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
            
            <div className="mt-8 pt-8 border-t border-gray-200 flex justify-between text-xs text-gray-400">
              <span>Gerado via Software de Dimensionamento de Malha NBR 15751</span>
              <span>Página 1/1</span>
            </div>

          </div>
        </div>
      )
    }

    if (activeStep === 6) {
      const resistance = selectedResistanceMethod === 'NBR' 
        ? (parseNumberBR(meshDepth) <= 0.25 ? getPreliminaryResistanceA() : getPreliminaryResistanceBValue())
        : getIEEE80Resistance()?.resistance
      
      const lx = parseNumberBR(meshLx)
      const ly = parseNumberBR(meshLy)
      const nx = parseInt(meshNx)
      const ny = parseInt(meshNy)
      const h = parseNumberBR(meshDepth)
      const d_mm = parseNumberBR(meshD)
      const d = d_mm / 1000
      const rho = apparentRho || parseNumberBR(rho1) || 100
      const im_kA = getMeshCurrent() || 0
      const im = im_kA * 1000
      const lt = getTotalLength()
      
      let n = 1
      if (lx > 0 && ly > 0 && nx > 0 && ny > 0) {
        const lc = (nx * ly) + (ny * lx)
        const lp = 2 * (lx + ly)
        n = lc / (lp / 2)
      }
      
      let D = 0
      if (nx > 1 && ny > 1) {
        const dx = lx / (nx - 1)
        const dy = ly / (ny - 1)
        D = (dx + dy) / 2
      }
      
      const kiBase = calculateKi(n)
      const ki = hasPerimeterRods ? 1 : kiBase
      const km = calculateKm(D, h, d, n, hasPerimeterRods) 
      const ks = calculateKs(D, h, n)
      
      const vMeshTouch = calculateMeshTouchVoltage(rho, im, km, ki, lt)
      const vMeshStep = calculateMeshStepVoltage(rho, im, ks, ki, lt)
      
      const gpr = (resistance && im_kA) 
        ? resistance * im
        : null
      
      const isGPRSafe = (gpr !== null && results.vToque !== null) ? gpr < results.vToque : false
      
      const isTouchSafe = (results.vToque !== null) ? vMeshTouch < results.vToque : false
      const isStepSafe = (results.vPasso !== null) ? vMeshStep < results.vPasso : false
      
      const isSafe = isGPRSafe || (isTouchSafe && isStepSafe)
      
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-soft p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-slate-50">
              <Activity className="w-5 h-5 text-amber-500" />
              6 - Potenciais Calculados (Malha)
            </h2>
            
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hasPerimeterRods}
                  onChange={(e) => setHasPerimeterRods(e.target.checked)}
                  className="text-amber-600 focus:ring-amber-500 h-4 w-4"
                />
                <span>Considerar hastes de aterramento locadas na periferia da malha (Ki = 1)</span>
              </div>
              
              <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded border">
                <p><strong>Parâmetros Geométricos Calculados:</strong></p>
                <p>Espaçamento Médio (D): {formatNumberBR(D, 2)} m</p>
                <p>Fator n (equiv): {formatNumberBR(n, 2)}</p>
                <p>Ki utilizado: {formatNumberBR(ki, 3)} | Km: {formatNumberBR(km, 3)} | Ks: {formatNumberBR(ks, 3)}</p>
                <p>
                  {hasPerimeterRods 
                    ? `Ki base sem hastes = ${formatNumberBR(kiBase, 3)} (substituído por 1,0 devido às hastes na periferia)` 
                    : `Ki calculado para malha sem hastes = ${formatNumberBR(kiBase, 3)}`}
                </p>
              </div>
              
              <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold text-gray-700">GPR (Elevação de Potencial):</span>
                    <span className="text-lg font-bold text-gray-900">{gpr ? formatNumberBR(gpr, 0) : '-'} V</span>
                 </div>
                 <div className="text-xs text-gray-500">R ({resistance ? formatNumberBR(resistance, 3) : '-'}Ω) x Im ({formatNumberBR(im_kA, 2)}kA)</div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-amber-50 rounded-md border border-amber-100">
                  <p className="text-xs text-amber-800 uppercase font-semibold mb-1">Tensão de Toque (Malha)</p>
                  <p className="text-2xl font-bold text-amber-900">{formatNumberBR(vMeshTouch, 0)} V</p>
                  <p className="text-[10px] text-amber-700 mt-1">Calculada (V_mesh)</p>
                </div>
                <div className="p-3 bg-amber-50 rounded-md border border-amber-100">
                  <p className="text-xs text-amber-800 uppercase font-semibold mb-1">Tensão de Passo (Malha)</p>
                  <p className="text-2xl font-bold text-amber-900">{formatNumberBR(vMeshStep, 0)} V</p>
                  <p className="text-[10px] text-amber-700 mt-1">Calculada (V_step)</p>
                </div>
              </div>
              
              <div className="text-xs text-slate-300 mt-2">
                 <p>
                  Valores calculados utilizando as equações da NBR 15751 / IEEE 80 para 
                  {hasPerimeterRods ? ' malhas com hastes de aterramento na periferia.' : ' malhas sem hastes de aterramento.'}
                 </p>
              </div>
              
            </div>
          </div>
          
          <div className="glass-soft p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <ShieldCheck className={`w-5 h-5 ${isSafe ? 'text-green-500' : 'text-orange-500'}`} />
              Validação de Segurança
            </h2>
            
            <div className="space-y-6">
              
              <div className={`p-4 rounded-lg border-l-4 ${isTouchSafe ? 'bg-green-50 border-green-500 text-gray-900' : 'bg-red-50 border-red-500 text-gray-900'}`}>
                <h3 className="font-semibold text-gray-900 mb-2">Segurança ao Toque</h3>
                <div className="flex justify-between items-center text-sm mb-1">
                  <span>Calculado (V_mesh):</span>
                  <span className="font-bold">{formatNumberBR(vMeshTouch, 0)} V</span>
                </div>
                <div className="flex justify-between items-center text-sm border-b pb-2 mb-2 border-gray-200">
                  <span>
                    Admissível (V_toque
                    {results.duration === 'longa' ? ' longa duração' : results.duration === 'curta' ? ' curta duração' : ''}
                    ):
                  </span>
                  <span className="font-bold">{results.vToque ? formatNumberBR(results.vToque, 0) : '-'} V</span>
                </div>
                <div className={`text-sm font-bold ${isTouchSafe ? 'text-green-700' : 'text-red-700'}`}>
                  {isTouchSafe ? 'APROVADO (V_mesh < V_toque)' : 'REPROVADO (V_mesh > V_toque)'}
                </div>
              </div>
              
              <div className={`p-4 rounded-lg border-l-4 ${isStepSafe ? 'bg-green-50 border-green-500 text-gray-900' : 'bg-red-50 border-red-500 text-gray-900'}`}>
                <h3 className="font-semibold text-gray-900 mb-2">Segurança ao Passo</h3>
                <div className="flex justify-between items-center text-sm mb-1">
                  <span>Calculado (V_step):</span>
                  <span className="font-bold">{formatNumberBR(vMeshStep, 0)} V</span>
                </div>
                <div className="flex justify-between items-center text-sm border-b pb-2 mb-2 border-gray-200">
                  <span>
                    Admissível (V_passo
                    {results.duration === 'longa' ? ' longa duração' : results.duration === 'curta' ? ' curta duração' : ''}
                    ):
                  </span>
                  <span className="font-bold">{results.vPasso ? formatNumberBR(results.vPasso, 0) : '-'} V</span>
                </div>
                <div className={`text-sm font-bold ${isStepSafe ? 'text-green-700' : 'text-red-700'}`}>
                  {isStepSafe ? 'APROVADO (V_step < V_passo)' : 'REPROVADO (V_step > V_passo)'}
                </div>
              </div>
              
              <div className={`mt-4 text-center p-2 rounded text-white font-bold ${isSafe ? 'bg-green-600' : 'bg-red-600'}`}>
                {isSafe ? 'SISTEMA SEGURO' : 'SISTEMA INSEGURO - REVISAR PROJETO'}
              </div>
              
              {isGPRSafe && (
                 <p className="text-xs text-green-700 text-center mt-2">
                   * Aprovado preliminarmente via GPR ({formatNumberBR(gpr,0)} V) &lt; V_toque
                 </p>
              )}
              
            </div>
          </div>
        </div>
      )
    }

    if (activeStep === 8) {
      const lx = parseNumberBR(meshLx) || 0
      const ly = parseNumberBR(meshLy) || 0
      const nx = parseInt(meshNx) || 2
      const ny = parseInt(meshNy) || 2
      const h = parseNumberBR(meshDepth) || 0.5
      const rodL = parseNumberBR(rodLength) || 2.4

      const rho = apparentRho || parseNumberBR(rho1) || 100
      const im_kA = getMeshCurrent() || 0
      const im = im_kA * 1000
      const lt = getTotalLength()

      let n = 1
      if (lx > 0 && ly > 0 && nx > 0 && ny > 0) {
        const lc = (nx * ly) + (ny * lx)
        const lp = 2 * (lx + ly)
        n = lp > 0 ? lc / (lp / 2) : 1
      }

      let D = 0
      if (nx > 1 && ny > 1) {
        const dx = lx / (nx - 1)
        const dy = ly / (ny - 1)
        D = (dx + dy) / 2
      }

      const kiBase = calculateKi(n)
      const ki = hasPerimeterRods ? 1 : kiBase
      const ks = calculateKs(D, h, n)
      const vMeshStep = calculateMeshStepVoltage(rho, im, ks, ki, lt)
      const legendMaxStep = vMeshStep > 0 && Number.isFinite(vMeshStep) ? vMeshStep : 0
      const legendStepTicks = legendMaxStep > 0
        ? Array.from({ length: 5 }, (_, i) => (legendMaxStep * (i + 1)) / 5)
        : [500, 400, 300, 200, 100]

      const offset = 1.5
      const totalW = lx + 2 * offset
      const totalH = ly + 2 * offset

      const canvasMaxSize = 600
      let canvasWidth = canvasMaxSize
      let canvasHeight = canvasMaxSize

      if (totalW > 0 && totalH > 0) {
        if (totalW >= totalH) {
          canvasHeight = Math.round(canvasMaxSize * (totalH / totalW))
        } else {
          canvasWidth = Math.round(canvasMaxSize * (totalW / totalH))
        }
      }

      const resolution = Math.max(140, Math.round(Math.max(canvasWidth, canvasHeight) / 3))

      const drawCanvas = (canvas: HTMLCanvasElement | null) => {
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const fieldData = calculatePotentialField(lx, ly, nx, ny, h, meshRods, rodL, resolution, offset)
        const stepMatrix = calculateStepMatrix(fieldData.matrix)

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const cellW = canvas.width / resolution
        const cellH = canvas.height / resolution

        for (let r = 0; r < resolution; r++) {
          for (let c = 0; c < resolution; c++) {
            const val = stepMatrix[r][c] // 0 (Baixo Gradiente) a 1 (Alto Gradiente)
            
            // Step Voltage é alta onde o gradiente é alto (perto dos condutores periféricos)
            // Color Mapping: Blue (Safe) -> Red (Danger)
            const hue = 240 - (val * 240)
            ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.8)`
            ctx.fillRect(c * cellW, r * cellH, cellW + 1, cellH + 1)
          }
        }

        // Overlay Grid
        const toCanvasX = (mX: number) => (mX + offset) / totalW * canvas.width
        const toCanvasY = (mY: number) => (mY + offset) / totalH * canvas.height

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)'
        ctx.lineWidth = 1.5

        for (let i = 0; i < nx; i++) {
            const x = i * (lx / (nx - 1))
            ctx.beginPath()
            ctx.moveTo(toCanvasX(x), toCanvasY(0))
            ctx.lineTo(toCanvasX(x), toCanvasY(ly))
            ctx.stroke()
        }
        for (let j = 0; j < ny; j++) {
            const y = j * (ly / (ny - 1))
            ctx.beginPath()
            ctx.moveTo(toCanvasX(0), toCanvasY(y))
            ctx.lineTo(toCanvasX(lx), toCanvasY(y))
            ctx.stroke()
        }
        
        // Hastes
        ctx.fillStyle = '#10b981'
        meshRods.forEach(rod => {
            const x = rod.i * (lx / (nx - 1))
            const y = rod.j * (ly / (ny - 1))
            const cx = toCanvasX(x)
            const cy = toCanvasY(y)
            ctx.fillRect(cx - 3, cy - 3, 6, 6)
        })
      }

      return (
        <div className="glass-soft p-6">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-slate-50">
            <Layers className="w-5 h-5 text-amber-400" />
            8 - Mapa de Tensão de Passo
          </h2>

          <div className="flex items-center justify-center bg-slate-900/50 rounded-lg p-6 border border-slate-700 w-full">
            <div className="flex-1 flex justify-center">
              <canvas
                ref={drawCanvas}
                width={canvasWidth}
                height={canvasHeight}
                className="rounded shadow-lg max-w-full h-auto"
                style={{ maxHeight: '70vh' }}
              />
            </div>
            <div className="ml-8 flex items-center justify-center">
              <div className="flex flex-col justify-between h-64 mr-1 text-xs font-semibold text-slate-100 text-right">
                {legendStepTicks.slice().reverse().map((value) => (
                  <span key={value}>{formatNumberBR(value, 0)}</span>
                ))}
              </div>
              <div className="flex flex-col items-center justify-center w-20">
                <span className="text-xs font-medium text-slate-300 mb-2 text-center">V_passo Alto (Perigo)</span>
                <div
                  className="w-3 h-64 rounded-full border border-slate-600 shadow-inner"
                  style={{ background: 'linear-gradient(to bottom, #b91c1c, #facc15, #22c55e, #1d4ed8)' }}
                />
                <span className="text-xs font-medium text-slate-300 mt-2 text-center">V_passo Baixo (Seguro)</span>
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (activeStep === 9) {
      const lx = parseNumberBR(meshLx) || 0
      const ly = parseNumberBR(meshLy) || 0
      const nx = parseInt(meshNx) || 2
      const ny = parseInt(meshNy) || 2
      const h = parseNumberBR(meshDepth) || 0.5
      const rodL = parseNumberBR(rodLength) || 2.4

      const d_mm = parseNumberBR(meshD)
      const d = d_mm / 1000
      const rho = apparentRho || parseNumberBR(rho1) || 100
      const im_kA = getMeshCurrent() || 0
      const im = im_kA * 1000
      const lt = getTotalLength()

      let n = 1
      if (lx > 0 && ly > 0 && nx > 0 && ny > 0) {
        const lc = (nx * ly) + (ny * lx)
        const lp = 2 * (lx + ly)
        n = lp > 0 ? lc / (lp / 2) : 1
      }

      let D = 0
      if (nx > 1 && ny > 1) {
        const dx = lx / (nx - 1)
        const dy = ly / (ny - 1)
        D = (dx + dy) / 2
      }

      const kiBase = calculateKi(n)
      const ki = hasPerimeterRods ? 1 : kiBase
      const km = calculateKm(D, h, d, n, hasPerimeterRods)
      const vMeshTouch = calculateMeshTouchVoltage(rho, im, km, ki, lt)
      const legendMaxTouch = vMeshTouch > 0 && Number.isFinite(vMeshTouch) ? vMeshTouch : 0
      const legendTouchTicks = legendMaxTouch > 0
        ? Array.from({ length: 5 }, (_, i) => (legendMaxTouch * (i + 1)) / 5)
        : [500, 400, 300, 200, 100]

      const offset = 1.5
      const totalW = lx + 2 * offset
      const totalH = ly + 2 * offset

      const canvasMaxSize = 600
      let canvasWidth = canvasMaxSize
      let canvasHeight = canvasMaxSize

      if (totalW > 0 && totalH > 0) {
        if (totalW >= totalH) {
          canvasHeight = Math.round(canvasMaxSize * (totalH / totalW))
        } else {
          canvasWidth = Math.round(canvasMaxSize * (totalW / totalH))
        }
      }

      const resolution = Math.max(140, Math.round(Math.max(canvasWidth, canvasHeight) / 3))

      const drawCanvas = (canvas: HTMLCanvasElement | null) => {
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        // Cálculo do campo de potencial
        const fieldData = calculatePotentialField(lx, ly, nx, ny, h, meshRods, rodL, resolution, offset)
        // Cálculo da matriz de toque (GPR - Potencial do Solo)
        const touchMatrix = calculateTouchMatrix(fieldData.matrix)

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const cellW = canvas.width / resolution
        const cellH = canvas.height / resolution

        for (let r = 0; r < resolution; r++) {
          for (let c = 0; c < resolution; c++) {
            const val = touchMatrix[r][c] // 0 (Seguro/Baixo) a 1 (Perigo/Alto)
            
            // Touch Voltage é alta onde o potencial do solo é baixo (longe dos condutores)
            // Color Mapping: Blue (Safe/Low V_touch) -> Red (Danger/High V_touch)
            // val = 0 (Perto do condutor) -> Blue
            // val = 1 (Centro da malha) -> Red
            const hue = 240 - (val * 240)
            ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.8)`
            ctx.fillRect(c * cellW, r * cellH, cellW + 1, cellH + 1)
          }
        }

        // Overlay Grid
        const toCanvasX = (mX: number) => (mX + offset) / totalW * canvas.width
        const toCanvasY = (mY: number) => (mY + offset) / totalH * canvas.height

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)'
        ctx.lineWidth = 1.5

        for (let i = 0; i < nx; i++) {
            const x = i * (lx / (nx - 1))
            ctx.beginPath()
            ctx.moveTo(toCanvasX(x), toCanvasY(0))
            ctx.lineTo(toCanvasX(x), toCanvasY(ly))
            ctx.stroke()
        }
        for (let j = 0; j < ny; j++) {
            const y = j * (ly / (ny - 1))
            ctx.beginPath()
            ctx.moveTo(toCanvasX(0), toCanvasY(y))
            ctx.lineTo(toCanvasX(lx), toCanvasY(y))
            ctx.stroke()
        }
        
        // Hastes
        ctx.fillStyle = '#10b981'
        meshRods.forEach(rod => {
            const x = rod.i * (lx / (nx - 1))
            const y = rod.j * (ly / (ny - 1))
            const cx = toCanvasX(x)
            const cy = toCanvasY(y)
            ctx.fillRect(cx - 3, cy - 3, 6, 6)
        })
      }

      return (
        <div className="glass-soft p-6">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-slate-50">
            <Activity className="w-5 h-5 text-amber-400" />
            9 - Mapa de Tensão de Toque
          </h2>

          <div className="flex items-center justify-center bg-slate-900/50 rounded-lg p-6 border border-slate-700 w-full">
            <div className="flex-1 flex justify-center">
              <canvas
                ref={drawCanvas}
                width={canvasWidth}
                height={canvasHeight}
                className="rounded shadow-lg max-w-full h-auto"
                style={{ maxHeight: '70vh' }}
              />
            </div>
            <div className="ml-8 flex items-center justify-center">
              <div className="flex flex-col justify-between h-64 mr-1 text-xs font-semibold text-slate-100 text-right">
                {legendTouchTicks.slice().reverse().map((value) => (
                  <span key={value}>{formatNumberBR(value, 0)}</span>
                ))}
              </div>
              <div className="flex flex-col items-center justify-center w-24">
                <span className="text-xs font-medium text-slate-300 mb-2 text-center">V_toque Alto (Perigo)</span>
                <div
                  className="w-3 h-64 rounded-full border border-slate-600 shadow-inner"
                  style={{ background: 'linear-gradient(to bottom, #b91c1c, #facc15, #22c55e, #1d4ed8)' }}
                />
                <span className="text-xs font-medium text-slate-300 mt-2 text-center">V_toque Baixo (Seguro)</span>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return null
  }

  const steps = [
    { id: 1, label: '1. Modelagem do Solo' },
    { id: 2, label: '2. Geometria da Malha' },
    { id: 3, label: '3. Corrente de malha' },
    { id: 4, label: '4. Dimens. do Condutor' },
    { id: 5, label: '5. Potencial Seguro' },
    { id: 6, label: '6. Potencial Calculado' },
    { id: 7, label: '7. Relatório' },
    { id: 8, label: '8. Mapa Passo' },
    { id: 9, label: '9. Mapa Toque' },
  ]

  return (
    <div className="min-h-screen px-4 py-4 md:px-6 md:py-6">
      <div className="max-w-7xl w-full mx-auto glass-shell px-4 py-5 md:px-8 md:py-7">
        <div className="flex gap-6">
          <aside className="w-56 flex-shrink-0 flex flex-col gap-4">
            <div className="bg-amber-500/95 text-slate-900 rounded-lg px-3 py-4 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-7 h-7 text-yellow-700" />
                <div className="leading-tight">
                  <p className="text-xs font-semibold uppercase tracking-wider">Aterramento</p>
                  <p className="text-sm font-bold">Subestação</p>
                </div>
              </div>
              <p className="text-xs font-semibold">NBR 15751</p>
              <p className="mt-1 text-[10px] leading-snug">
                Fluxo guiado por etapas para projeto de malha de terra
              </p>
            </div>

            <nav className="flex-1 flex flex-col gap-2">
              {steps.map((step) => {
                const isActive = activeStep === step.id
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setActiveStep(step.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-amber-500/90 text-slate-900'
                        : 'bg-slate-900/60 text-slate-100 hover:bg-slate-800/80'
                    }`}
                  >
                    {step.label}
                  </button>
                )
              })}
            </nav>
          </aside>

          <main className="flex-1">
            <div className="glass-panel">
              {renderStepContent()}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

export default App
