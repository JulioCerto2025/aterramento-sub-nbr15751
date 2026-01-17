
export interface ConductorMaterial {
  id: string;
  name: string;
  alpha20: number; // 1/°C
  tFusion: number; // °C
  rho20: number;   // μΩ.cm
  tcap: number;    // J/(cm³·°C)
}

export const conductorMaterials: ConductorMaterial[] = [
  {
    id: 'copper_soft',
    name: 'Cobre (macio)',
    alpha20: 0.00393,
    tFusion: 1083,
    rho20: 1.724,
    tcap: 3.422
  },
  {
    id: 'copper_hard',
    name: 'Cobre (duro)',
    alpha20: 0.00381,
    tFusion: 1084,
    rho20: 1.777,
    tcap: 3.422
  },
  {
    id: 'copper_clad_steel_40',
    name: 'Aço cobreado 40%',
    alpha20: 0.00378,
    tFusion: 1084,
    rho20: 4.397,
    tcap: 3.846
  },
  {
    id: 'copper_clad_steel_30',
    name: 'Aço cobreado 30%',
    alpha20: 0.00378,
    tFusion: 1084,
    rho20: 5.862,
    tcap: 3.846
  },
  {
    id: 'copper_clad_steel_rod',
    name: 'Haste de aço cobreado (20%)',
    alpha20: 0.00378,
    tFusion: 1084,
    rho20: 8.62,
    tcap: 3.846
  },
  {
    id: 'aluminum_wire',
    name: 'Fio de alumínio (EC grade)',
    alpha20: 0.00403,
    tFusion: 657,
    rho20: 2.862,
    tcap: 2.556
  },
  {
    id: 'aluminum_alloy_5005',
    name: 'Liga de alumínio 5005',
    alpha20: 0.00353,
    tFusion: 660,
    rho20: 3.222,
    tcap: 2.598
  },
  {
    id: 'aluminum_alloy_6201',
    name: 'Liga de alumínio 6201',
    alpha20: 0.00347,
    tFusion: 660,
    rho20: 3.284,
    tcap: 2.598
  },
  {
    id: 'steel_aluminum',
    name: 'Aço-alumínio',
    alpha20: 0.00360,
    tFusion: 660,
    rho20: 8.480,
    tcap: 2.670
  },
  {
    id: 'steel_1020',
    name: 'Aço 1020',
    alpha20: 0.00160,
    tFusion: 1510,
    rho20: 15.90,
    tcap: 3.28
  },
  {
    id: 'zinc_coated_steel',
    name: 'Aço zincado',
    alpha20: 0.00320,
    tFusion: 419,
    rho20: 20.1,
    tcap: 3.931
  },
  {
    id: 'stainless_steel_304',
    name: 'Aço inoxidável 304',
    alpha20: 0.00130,
    tFusion: 1400,
    rho20: 72.0,
    tcap: 4.032
  }
];

export interface ConnectionType {
  id: string;
  name: string;
  maxTemp: number; // °C
}

export const connectionTypes: ConnectionType[] = [
  {
    id: 'mechanical',
    name: 'Mecânica (aparafusada ou por pressão)',
    maxTemp: 250
  },
  {
    id: 'oxyacetylene',
    name: 'Emenda tipo solda oxiacetilênica',
    maxTemp: 450
  },
  {
    id: 'exothermic',
    name: 'Emenda com solda exotérmica',
    maxTemp: 850
  },
  {
    id: 'compression_hydraulic',
    name: 'Emenda a compressão',
    maxTemp: 850
  }
];
