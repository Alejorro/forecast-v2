/**
 * UI strings — Spanish (es-AR) localization.
 *
 * Rules applied:
 * - General UI text, buttons, labels, navigation → Spanish
 * - Corporate/industry terms kept in English:
 *   Brand, Sub Brand, TCV, Weighted, Forecast, Pipeline, Won, Gap,
 *   FY, Plan, Quarter, Odoo Opportunity, Brand Opp #, LOSS,
 *   stage values (IDENTIFIED, PROPOSAL, WON)
 */

const t = {
  // ── Navigation ──────────────────────────────────────────────────────────────
  nav: {
    overview:     'Resumen',
    transactions: 'Transacciones',
    plans:        'Planes',
    brands:       'Brands',
    sellers:      'Vendedores',
    import:       'Importar',
  },

  // ── Common ───────────────────────────────────────────────────────────────────
  year:    'Año',
  loading: 'Cargando...',
  retry:   'Reintentar',
  total:   'Total',
  noPlan:  'Sin plan',

  // ── Overview page ─────────────────────────────────────────────────────────
  overview: {
    title:    'Resumen',
    subtitle: (year) => `Resumen del forecast para ${year}`,
    kpi: {
      totalPlan:  'Plan Total',
      fyForecast: 'FY Forecast',
      totalWon:   'Total Won',
      gap:        'Gap (Plan − Forecast)',
    },
    sections: {
      quarterlyChart:    'Plan vs Forecast vs Won por Quarter',
      pipelineByStage:   'Pipeline por Estado',
      gapByBrand:        'Gap por Brand',
      topOpportunities:  'Top 5 Oportunidades Activas',
    },
    noData:         'Sin datos disponibles.',
    noPipelineData: 'Sin datos de pipeline.',
    noOpportunities:'Sin oportunidades activas.',
    forecastLabel:  'forecast',
    planLabel:      'plan',
  },

  // ── Transactions page ──────────────────────────────────────────────────────
  transactions: {
    title:            'Transacciones',
    newTransaction:   'Nueva Transacción',
    searchPlaceholder:'Buscar cliente o proyecto...',
    allBrands:        'Todos los brands',
    allSellers:       'Todos los vendedores',
    allStages:        'Todos los estados',
    allQuarters:      'Todos los quarters',
    clearFilters:     'Limpiar filtros',
    count:            (n) => `${n} transacción${n !== 1 ? 'es' : ''}`,
    loadingList:      'Cargando transacciones...',
    noMatchFilters:   'Ninguna transacción coincide con los filtros.',
    noMatchHint:      'Intentá ajustar la búsqueda o los filtros.',
    emptyTitle:       'Sin transacciones aún',
    emptyHint:        'Creá tu primera transacción para empezar a registrar el forecast.',
    columns: {
      client:   'Cliente',
      brand:    'Brand',
      seller:   'Vendedor',
      tcv:      'TCV',
      stage:    'Estado',
      weighted: 'Weighted',
      type:     'Type',
    },
  },

  // ── Transaction drawer ────────────────────────────────────────────────────
  drawer: {
    titleNew:  'Nueva Transacción',
    titleEdit: 'Editar Transacción',
    ariaNew:   'Nueva Transacción',
    ariaEdit:  'Editar Transacción',
    close:     'Cerrar',
    fields: {
      clientName:             'Nombre de cliente',
      brand:                  'Brand',
      seller:                 'Vendedor',
      subBrand:               'Sub Brand',
      tcv:                    'TCV (USD)',
      dueDate:                'Fecha estimada',
      stage:                  'Estado',
      quarter:                'Quarter',
      vendorName:             'Proveedor',
      notes:                  'Notas',
      odooOpportunity:        'Odoo Opportunity',
      brandOpp:               'Brand Opp #',
      invoiceNumber:          'Número de factura',
      transactionType:        'Type',
    },
    placeholders: {
      clientName:    'Ej: Acme Corp',
      optional:      'Opcional',
      optionalNotes: 'Notas opcionales...',
      selectBrand:   'Seleccioná un brand...',
      selectSeller:  'Seleccioná un vendedor...',
      selectQuarter: 'Seleccioná un quarter...',
    },
    validation: {
      required:      'Requerido',
      invalidAmount: 'Ingresá un monto válido',
    },
    delete: {
      question: '¿Eliminar esta transacción?',
      button:   'Eliminar transacción',
      confirm:  'Confirmar eliminación',
      cancel:   'Cancelar',
    },
    save:   'Guardar',
    saving: 'Guardando...',
    cancel: 'Cancelar',
  },

  // ── Plans page ────────────────────────────────────────────────────────────
  plans: {
    title:           'Planes',
    saveAll:         'Guardar todos los cambios',
    saving:          'Guardando...',
    brandsModified:  (n) => `${n} brand${n !== 1 ? 's' : ''} modificado${n !== 1 ? 's' : ''}`,
    loadingPlans:    'Cargando planes...',
    noBrands:        'No se encontraron brands',
    editHint:        'Hacé clic en cualquier celda Q1–Q4 para editar. Los cambios sin guardar se resaltan en amarillo.',
    retry:           'Reintentar',
  },

  // ── Brands page ───────────────────────────────────────────────────────────
  brands: {
    title:    'Brands',
    subtitle: (year) => `Rendimiento del forecast por brand para ${year}`,
    kpi: {
      fyPlan:           'FY Plan',
      weightedForecast: 'Weighted Forecast',
      won:              'Won',
      gap:              'Gap (Plan − Forecast)',
    },
    sections: {
      quarterlyBreakdown: 'Desglose trimestral',
      pipelineByStage:    'Pipeline por estado',
      topTransactions:    'Top transacciones',
    },
    noPipelineData:  'Sin datos de pipeline.',
    noTransactions:  'Sin transacciones activas.',
    totalWeighted:   'Total weighted',
    columns: {
      client:  'Cliente',
      seller:  'Vendedor',
      stage:   'Estado',
    },
  },

  // ── Sellers page ──────────────────────────────────────────────────────────
  sellers: {
    title:          'Vendedores',
    subtitle:       (year) => `Contribución por vendedor para ${year}`,
    loadingSellers: 'Cargando vendedores...',
    noSellers:      'No se encontraron vendedores.',
    noTransactions: 'Sin transacciones para este año.',
    clickHint:      'Hacé clic en una fila para ver las transacciones del vendedor.',
    columns: {
      seller:           'Vendedor',
      deals:            'Deals',
      tcvTotal:         'TCV Total',
      weightedForecast: 'Weighted Forecast',
      won:              'Won',
      contribution:     'Contribución',
    },
    subColumns: {
      client:  'Cliente',
      brand:   'Brand',
      stage:   'Estado',
    },
    total: 'Total',
  },

  // ── Import page ───────────────────────────────────────────────────────────
  import: {
    title:           'Importar',
    subtitle:        'Subí un archivo Excel para importar planes y transacciones.',
    fileSection:     'Archivo',
    remove:          'Eliminar',
    dropPrompt:      'Arrastrá un archivo .xlsx, o',
    browse:          'buscá',
    acceptedFormat:  'Formato aceptado: .xlsx',
    validationNote:  'El archivo será validado antes de escribir datos.',
    validateButton:  'Validar archivo',
    validationTitle: 'Resumen de validación',
    importAction:    'Importar filas válidas',
    importNote:      'Las filas con errores serán ignoradas. Solo se importarán las filas válidas.',
    runFirst:        'Ejecutá la validación primero para ver los resultados.',
    logTitle:        'Log',
    noResultsYet:    'Sin resultados. Subí un archivo y ejecutá la validación.',
    statLabels: {
      plans:        'Planes',
      transactions: 'Transacciones',
      skipped:      'Filas omitidas',
      errors:       'Errores',
    },
  },
}

export default t
