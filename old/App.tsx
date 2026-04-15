import { useEffect, useMemo, useState } from 'react';
import { Wallet, Landmark, ArrowDownCircle, ArrowUpCircle, CreditCard, BarChart3 } from 'lucide-react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getJSON, postJSON, putJSON, deleteJSON } from './api';

type Entrada = {
  id: number;
  data: string;
  descricao: string;
  categoria: string;
  valor: number;
  status: string;
};

type SaidaApi = {
  id: number;
  data: string;
  descricao: string;
  categoria: string;
  forma_pagamento: string;
  valor: number;
  status: string;
};

type SaidaUI = {
  id: number;
  data: string;
  descricao: string;
  categoria: string;
  forma: string;
  valor: number;
  status: string;
};

type DespesaApi = {
  id: number;
  conta_mes: string;
  descricao: string;
  vencimento: string;
  forma_pagamento: string;
  valor: number;
  status: 'Pendente' | 'Pago' | 'Vencido';
};

type DespesaUI = {
  id: number;
  contaMes: string;
  categoria: string;
  descricao: string;
  vencimento: string;
  formaPagamento: string;
  valor: number;
  status: 'Pendente' | 'Pago' | 'Vencido';
};

export default function FluxoCaixaApp() {
  const [activeView, setActiveView] = useState('Dashboard');
  const [periodo, setPeriodo] = useState('Abril / 2026');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const periodOptions = [
    { label: 'Abril / 2026', month: 4, year: 2026, short: 'Abr' },
    { label: 'Março / 2026', month: 3, year: 2026, short: 'Mar' },
    { label: 'Fevereiro / 2026', month: 2, year: 2026, short: 'Fev' },
  ];

  const selectedPeriod = periodOptions.find((item) => item.label === periodo) || periodOptions[0];

  const categoriasEntrada = [
    'Serviços',
    'Vendas',
    'Comissões',
    'Recebimentos',
    'Pagamentos',
    'Salário',
    'Extra',
    'Outros',
  ];

  const categoriasSaida = [
    'Água',
    'Água e Gás',
    'Almoço',
    'Carro',
    'Cartão de Crédito',
    'Combustível',
    'Dentista',
    'Empréstimos',
    'Farmácia',
    'Fast Food',
    'IPTU',
    'IPVA',
    'Jantar',
    'Licenciamento',
    'Luz',
    'Maquiagem',
    'Médico',
    'Mercado',
    'Multa',
    'Operadora',
    'Perua Escolar',
    'Pix',
    'Quitanda',
    'Salão de Beleza',
    'Seguro',
    'Shopping',
    'Vigilância',
  ];

  const formasPagamento = ['PIX', 'Boleto', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência', 'Dinheiro'];

  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [saidas, setSaidas] = useState<SaidaUI[]>([]);
  const [contasPagar, setContasPagar] = useState<DespesaUI[]>([]);

  const [entradaForm, setEntradaForm] = useState({ data: '', descricao: '', categoria: 'Serviços', valor: '' });
  const [saidaForm, setSaidaForm] = useState({ data: '', descricao: '', categoria: 'Água', forma: 'PIX', valor: '' });
  const [contaForm, setContaForm] = useState({
    contaMes: 'Água',
    descricao: '',
    vencimento: '',
    formaPagamento: 'PIX',
    valor: '',
    status: 'Pendente' as 'Pendente' | 'Pago',
  });

  const [selectedEntradaId, setSelectedEntradaId] = useState<number | null>(null);
  const [selectedSaidaId, setSelectedSaidaId] = useState<number | null>(null);
  const [selectedContaId, setSelectedContaId] = useState<number | null>(null);

  const menuItems = ['Dashboard', 'Entradas', 'Saídas', 'Despesas do Mês', 'Relatórios'];

  const cardClass =
    'rounded-[28px] bg-white/90 backdrop-blur-sm shadow-[0_18px_60px_rgba(15,23,42,0.10)] border border-white/70 p-5';
  const glassCardClass =
    'rounded-[28px] bg-white/75 backdrop-blur-md shadow-[0_18px_60px_rgba(15,23,42,0.12)] border border-white/70';
  const primaryButtonClass =
    'inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(37,99,235,0.28)] transition hover:-translate-y-0.5';
  const secondaryButtonClass =
    'inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 bg-white border border-slate-200 shadow-sm transition hover:bg-slate-50';
  const inputClass =
    'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500';

  const formatCurrency = (value: number | string | undefined | null) =>
    Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatCurrencyInput = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    const numberValue = Number(digits) / 100;
    return numberValue.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const parseCurrencyInput = (value: string) => {
    if (!value) return 0;

    const normalized = value
      .replace(/\s/g, '')
      .replace('R$', '')
      .replace(/\./g, '')
      .replace(',', '.');

    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const parseDate = (value: string) => {
    if (!value || typeof value !== 'string') return null;
    const parts = value.split('/');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map(Number);
    if (!day || !month || !year) return null;
    return { day, month, year };
  };

  const toDate = (value: string) => {
    const parsed = parseDate(value);
    if (!parsed) return null;
    return new Date(parsed.year, parsed.month - 1, parsed.day);
  };

  const getContaStatus = (item: DespesaUI) => {
    if (item.status === 'Pago') return 'Pago';
    const vencimento = toDate(item.vencimento);
    if (!vencimento) return item.status || 'Pendente';
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (vencimento < hoje) return 'Vencido';
    return 'Pendente';
  };

  const matchesSelectedPeriod = (value: string) => {
    const parsed = parseDate(value);
    if (!parsed) return false;
    return parsed.month === selectedPeriod.month && parsed.year === selectedPeriod.year;
  };

  const mapSaidaApiToUI = (item: SaidaApi): SaidaUI => ({
    id: item.id,
    data: item.data,
    descricao: item.descricao,
    categoria: item.categoria,
    forma: item.forma_pagamento,
    valor: item.valor,
    status: item.status,
  });

  const mapDespesaApiToUI = (item: DespesaApi): DespesaUI => ({
    id: item.id,
    contaMes: item.conta_mes,
    categoria: item.conta_mes,
    descricao: item.descricao,
    vencimento: item.vencimento,
    formaPagamento: item.forma_pagamento,
    valor: item.valor,
    status: item.status,
  });

  async function carregarEntradas() {
    const data = await getJSON<Entrada[]>('/entradas');
    setEntradas(data);
  }

  async function carregarSaidas() {
    const data = await getJSON<SaidaApi[]>('/saidas');
    setSaidas(data.map(mapSaidaApiToUI));
  }

  async function carregarDespesas() {
    const data = await getJSON<DespesaApi[]>('/despesas');
    setContasPagar(data.map(mapDespesaApiToUI));
  }

  async function carregarTudo() {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([carregarEntradas(), carregarSaidas(), carregarDespesas()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarTudo();
  }, []);

  const entradasFiltradas = useMemo(
    () => entradas.filter((item) => matchesSelectedPeriod(item.data)),
    [entradas, periodo]
  );

  const saidasFiltradas = useMemo(
    () => saidas.filter((item) => matchesSelectedPeriod(item.data)),
    [saidas, periodo]
  );

  const contasPagarFiltradas = useMemo(
    () => contasPagar.filter((item) => matchesSelectedPeriod(item.vencimento)),
    [contasPagar, periodo]
  );

  const totais = useMemo(() => {
    const saldoInicial = 0;
    const totalEntradas = entradasFiltradas.reduce((acc, item) => acc + Number(item.valor || 0), 0);

    const totalSaidasBase = saidasFiltradas
      .filter((item) => item.forma !== 'Cartão de Crédito')
      .reduce((acc, item) => acc + Number(item.valor || 0), 0);

    const totalCartaoCredito = saidas
      .filter((item) => item.status === 'Pago' && item.forma === 'Cartão de Crédito')
      .reduce((acc, item) => acc + Number(item.valor || 0), 0);

    const totalContasDebitamSaldo = contasPagarFiltradas
      .filter((item) => getContaStatus(item) === 'Pago' && item.formaPagamento !== 'Cartão de Crédito')
      .reduce((acc, item) => acc + Number(item.valor || 0), 0);

    const totalSaidas = totalSaidasBase + totalContasDebitamSaldo;
    const saldoAtual = saldoInicial + totalEntradas - totalSaidas;
    const totalContasPagar = contasPagarFiltradas.filter((item) => getContaStatus(item) !== 'Pago').length;
    const totalContasVencidas = contasPagarFiltradas.filter((item) => getContaStatus(item) === 'Vencido').length;

    return {
      saldoInicial,
      totalEntradas,
      totalSaidas,
      saldoAtual,
      totalContasPagar,
      totalContasVencidas,
      totalCartaoCredito,
    };
  }, [entradasFiltradas, saidasFiltradas, contasPagarFiltradas, saidas]);

  const fluxoMensalChart = useMemo(() => {
    return periodOptions.map((option) => {
      const entradasMes = entradas
        .filter((item) => {
          const parsed = parseDate(item.data);
          return parsed && parsed.month === option.month && parsed.year === option.year;
        })
        .reduce((acc, item) => acc + Number(item.valor || 0), 0);

      const saidasMesBase = saidas
        .filter((item) => {
          const parsed = parseDate(item.data);
          return (
            parsed &&
            parsed.month === option.month &&
            parsed.year === option.year &&
            item.forma !== 'Cartão de Crédito'
          );
        })
        .reduce((acc, item) => acc + Number(item.valor || 0), 0);

      const despesasMesDebitam = contasPagar
        .filter((item) => {
          const parsed = parseDate(item.vencimento);
          return (
            parsed &&
            parsed.month === option.month &&
            parsed.year === option.year &&
            getContaStatus(item) === 'Pago' &&
            item.formaPagamento !== 'Cartão de Crédito'
          );
        })
        .reduce((acc, item) => acc + Number(item.valor || 0), 0);

      const saidasMes = saidasMesBase + despesasMesDebitam;

      return {
        mes: option.short,
        entradas: entradasMes,
        saidas: saidasMes,
        progresso: entradasMes - saidasMes,
      };
    });
  }, [entradas, saidas, contasPagar]);

  const maxEntradaChart = useMemo(() => {
    if (!fluxoMensalChart.length) return 0;
    return Math.max(...fluxoMensalChart.map((item) => item.entradas), 0);
  }, [fluxoMensalChart]);

  const maxSaidaChart = useMemo(() => {
    if (!fluxoMensalChart.length) return 0;
    return Math.max(...fluxoMensalChart.map((item) => item.saidas), 0);
  }, [fluxoMensalChart]);

  const movimentacoes = useMemo(() => {
    const itensEntradas = entradasFiltradas.map((item) => ({
      id: `e-${item.id}`,
      data: item.data,
      tipo: 'Entrada',
      descricao: item.descricao,
      categoria: item.categoria,
      valor: formatCurrency(item.valor),
      forma: '-',
      status: item.status || 'Recebido',
    }));

    const itensSaidas = saidasFiltradas.map((item) => ({
      id: `s-${item.id}`,
      data: item.data,
      tipo: 'Saída',
      descricao: item.descricao,
      categoria: item.categoria,
      valor: formatCurrency(item.valor),
      forma: item.forma || '-',
      status: item.status || 'Pago',
    }));

    const itensContas = contasPagarFiltradas
      .filter((item) => getContaStatus(item) === 'Pago')
      .map((item) => ({
        id: `c-${item.id}`,
        data: item.vencimento,
        tipo: 'Despesas do Mês',
        descricao: item.descricao,
        categoria: item.categoria,
        valor: formatCurrency(item.valor),
        forma: item.formaPagamento || '-',
        status: getContaStatus(item),
      }));

    const toSortableDate = (value: string) => {
      const [day, month, year] = value.split('/').map(Number);
      return new Date(year, month - 1, day).getTime();
    };

    return [...itensEntradas, ...itensSaidas, ...itensContas]
      .sort((a, b) => toSortableDate(b.data) - toSortableDate(a.data))
      .slice(0, 10);
  }, [entradasFiltradas, saidasFiltradas, contasPagarFiltradas]);

  const statusClass = (status: string) => {
    if (status === 'Recebido') return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
    if (status === 'Pago') return 'bg-blue-100 text-blue-700 border border-blue-200';
    if (status === 'Vencido') return 'bg-red-100 text-red-700 border border-red-200';
    return 'bg-amber-100 text-amber-700 border border-amber-200';
  };

  const movimentoRowClass = (status: string) => {
    if (status === 'Recebido') return 'bg-emerald-50/70 hover:bg-emerald-50';
    if (status === 'Pago') return 'bg-blue-50/70 hover:bg-blue-50';
    if (status === 'Vencido') return 'bg-red-50/70 hover:bg-red-50';
    return 'bg-white hover:bg-slate-50';
  };

  const exportExcel = (fileName: string, rows: Record<string, unknown>[]) => {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados');
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportPdf = (title: string, rows: Record<string, unknown>[]) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(title, 14, 18);
    const headers = rows.length ? [Object.keys(rows[0])] : [['Informação']];
    const body = rows.length ? rows.map((row) => Object.values(row)) : [['Nenhum dado para exportar']];
    autoTable(doc, {
      startY: 26,
      head: headers,
      body,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [31, 41, 55] },
    });
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportDashboardExcel = () =>
    exportExcel(`dashboard_${selectedPeriod.short}_${selectedPeriod.year}`, [
      { indicador: 'Saldo Inicial', valor: totais.saldoInicial },
      { indicador: 'Total de Entradas', valor: totais.totalEntradas },
      { indicador: 'Total de Saídas', valor: totais.totalSaidas },
      { indicador: 'Saldo Atual', valor: totais.saldoAtual },
      { indicador: 'Despesas do Mês', valor: totais.totalContasPagar },
      { indicador: 'Despesas Vencidas', valor: totais.totalContasVencidas },
    ]);

  const exportDashboardPdf = () =>
    exportPdf(`Dashboard ${periodo}`, [
      { Indicador: 'Saldo Inicial', Valor: formatCurrency(totais.saldoInicial) },
      { Indicador: 'Total de Entradas', Valor: formatCurrency(totais.totalEntradas) },
      { Indicador: 'Total de Saídas', Valor: formatCurrency(totais.totalSaidas) },
      { Indicador: 'Saldo Atual', Valor: formatCurrency(totais.saldoAtual) },
      { Indicador: 'Despesas do Mês', Valor: totais.totalContasPagar },
      { Indicador: 'Despesas Vencidas', Valor: totais.totalContasVencidas },
    ]);

  const exportEntradasExcel = () =>
    exportExcel(
      `entradas_${selectedPeriod.short}_${selectedPeriod.year}`,
      entradasFiltradas.map((item) => ({
        Data: item.data,
        Descrição: item.descricao,
        Categoria: item.categoria,
        Valor: item.valor,
        Status: item.status,
      }))
    );

  const exportEntradasPdf = () =>
    exportPdf(
      `Entradas ${periodo}`,
      entradasFiltradas.map((item) => ({
        Data: item.data,
        Descrição: item.descricao,
        Categoria: item.categoria,
        Valor: formatCurrency(item.valor),
        Status: item.status,
      }))
    );

  const exportSaidasExcel = () =>
    exportExcel(
      `saidas_${selectedPeriod.short}_${selectedPeriod.year}`,
      saidasFiltradas.map((item) => ({
        Data: item.data,
        Descrição: item.descricao,
        Categoria: item.categoria,
        'Forma de Pagamento': item.forma,
        Valor: item.valor,
        Status: item.status,
      }))
    );

  const exportSaidasPdf = () =>
    exportPdf(
      `Saídas ${periodo}`,
      saidasFiltradas.map((item) => ({
        Data: item.data,
        Descrição: item.descricao,
        Categoria: item.categoria,
        'Forma de Pagamento': item.forma,
        Valor: formatCurrency(item.valor),
        Status: item.status,
      }))
    );

  const exportContasExcel = () =>
    exportExcel(
      `despesas_mes_${selectedPeriod.short}_${selectedPeriod.year}`,
      contasPagarFiltradas.map((item) => ({
        'Despesas do Mês': item.contaMes,
        Descrição: item.descricao,
        Categoria: item.categoria,
        'Forma de Pagamento': item.formaPagamento,
        Valor: item.valor,
        'Data de Vencimento': item.vencimento,
        Status: getContaStatus(item),
      }))
    );

  const exportContasPdf = () =>
    exportPdf(
      `Despesas do Mês ${periodo}`,
      contasPagarFiltradas.map((item) => ({
        'Despesas do Mês': item.contaMes,
        Descrição: item.descricao,
        Categoria: item.categoria,
        'Forma de Pagamento': item.formaPagamento,
        Valor: formatCurrency(item.valor),
        'Data de Vencimento': item.vencimento,
        Status: getContaStatus(item),
      }))
    );

  const exportResumoMensalExcel = () =>
    exportExcel(`relatorio_resumo_${selectedPeriod.short}_${selectedPeriod.year}`, [
      { Indicador: 'Entradas', Valor: totais.totalEntradas },
      { Indicador: 'Saídas', Valor: totais.totalSaidas },
      { Indicador: 'Saldo Atual', Valor: totais.saldoAtual },
    ]);

  const exportResumoMensalPdf = () =>
    exportPdf(`Resumo Mensal ${periodo}`, [
      { Indicador: 'Entradas', Valor: formatCurrency(totais.totalEntradas) },
      { Indicador: 'Saídas', Valor: formatCurrency(totais.totalSaidas) },
      { Indicador: 'Saldo Atual', Valor: formatCurrency(totais.saldoAtual) },
    ]);

  const exportEntradasCategoriaExcel = () => {
    const grouped = categoriasEntrada
      .map((categoria) => ({
        Categoria: categoria,
        Total: entradasFiltradas
          .filter((item) => item.categoria === categoria)
          .reduce((sum, item) => sum + Number(item.valor || 0), 0),
      }))
      .filter((item) => item.Total > 0);
    exportExcel(`entradas_categoria_${selectedPeriod.short}_${selectedPeriod.year}`, grouped);
  };

  const exportEntradasCategoriaPdf = () => {
    const grouped = categoriasEntrada
      .map((categoria) => ({
        Categoria: categoria,
        Total: formatCurrency(
          entradasFiltradas
            .filter((item) => item.categoria === categoria)
            .reduce((sum, item) => sum + Number(item.valor || 0), 0)
        ),
      }))
      .filter((item) => item.Total !== formatCurrency(0));
    exportPdf(`Entradas por Categoria ${periodo}`, grouped);
  };

  const exportSaidasCategoriaExcel = () => {
    const grouped = categoriasSaida
      .map((categoria) => ({
        Categoria: categoria,
        Total: saidasFiltradas
          .filter((item) => item.categoria === categoria)
          .reduce((sum, item) => sum + Number(item.valor || 0), 0),
      }))
      .filter((item) => item.Total > 0);
    exportExcel(`saidas_categoria_${selectedPeriod.short}_${selectedPeriod.year}`, grouped);
  };

  const exportSaidasCategoriaPdf = () => {
    const grouped = categoriasSaida
      .map((categoria) => ({
        Categoria: categoria,
        Total: formatCurrency(
          saidasFiltradas
            .filter((item) => item.categoria === categoria)
            .reduce((sum, item) => sum + Number(item.valor || 0), 0)
        ),
      }))
      .filter((item) => item.Total !== formatCurrency(0));
    exportPdf(`Saídas por Categoria ${periodo}`, grouped);
  };

  const addEntrada = async () => {
    if (!entradaForm.data || !entradaForm.descricao || !entradaForm.valor) return;

    const [year, month, day] = entradaForm.data.split('-');
    const dataFormatada = year && month && day ? `${day}/${month}/${year}` : entradaForm.data;

    const payload = {
      data: dataFormatada,
      descricao: entradaForm.descricao,
      categoria: entradaForm.categoria,
      valor: parseCurrencyInput(entradaForm.valor),
      status: 'Recebido',
    };

    try {
      setError(null);
      if (selectedEntradaId) {
        await putJSON(`/entradas/${selectedEntradaId}`, payload);
      } else {
        await postJSON('/entradas', payload);
      }

      setEntradaForm({ data: '', descricao: '', categoria: 'Serviços', valor: '' });
      setSelectedEntradaId(null);
      await carregarEntradas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar entrada');
    }
  };

  const addSaida = async () => {
    if (!saidaForm.data || !saidaForm.descricao || !saidaForm.valor) return;

    const [year, month, day] = saidaForm.data.split('-');
    const dataFormatada = year && month && day ? `${day}/${month}/${year}` : saidaForm.data;

    const payload = {
      data: dataFormatada,
      descricao: saidaForm.descricao,
      categoria: saidaForm.categoria,
      forma_pagamento: saidaForm.forma,
      valor: parseCurrencyInput(saidaForm.valor),
      status: 'Pago',
    };

    try {
      setError(null);
      if (selectedSaidaId) {
        await putJSON(`/saidas/${selectedSaidaId}`, payload);
      } else {
        await postJSON('/saidas', payload);
      }

      setSaidaForm({ data: '', descricao: '', categoria: 'Água', forma: 'PIX', valor: '' });
      setSelectedSaidaId(null);
      await carregarSaidas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar saída');
    }
  };

  const addConta = async () => {
    if (!contaForm.contaMes || !contaForm.descricao || !contaForm.vencimento || !contaForm.valor) return;

    const [year, month, day] = contaForm.vencimento.split('-');
    const dataFormatada = year && month && day ? `${day}/${month}/${year}` : contaForm.vencimento;

    const payload = {
      conta_mes: contaForm.contaMes,
      descricao: contaForm.descricao,
      vencimento: dataFormatada,
      forma_pagamento: contaForm.formaPagamento,
      valor: parseCurrencyInput(contaForm.valor),
      status: contaForm.status === 'Pago' ? 'Pago' : 'Pendente',
    };

    try {
      setError(null);
      if (selectedContaId) {
        await putJSON(`/despesas/${selectedContaId}`, payload);
      } else {
        await postJSON('/despesas', payload);
      }

      setContaForm({
        contaMes: 'Água',
        descricao: '',
        vencimento: '',
        formaPagamento: 'PIX',
        valor: '',
        status: 'Pendente',
      });
      setSelectedContaId(null);
      await carregarDespesas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar despesa');
    }
  };

  const fillContaForm = (item: DespesaUI) => {
    const [day, month, year] = item.vencimento.split('/');
    const vencimentoFormatado = day && month && year ? `${year}-${month}-${day}` : item.vencimento;
    setContaForm({
      contaMes: item.contaMes || item.categoria || 'Água',
      descricao: item.descricao || '',
      vencimento: vencimentoFormatado,
      formaPagamento: item.formaPagamento || 'PIX',
      valor: item.valor ? formatCurrency(item.valor) : '',
      status: getContaStatus(item) === 'Pago' ? 'Pago' : 'Pendente',
    });
    setSelectedContaId(item.id);
  };

  const deleteConta = async () => {
    if (!selectedContaId) return;
    try {
      setError(null);
      await deleteJSON(`/despesas/${selectedContaId}`);
      setContaForm({ contaMes: 'Água', descricao: '', vencimento: '', formaPagamento: 'PIX', valor: '', status: 'Pendente' });
      setSelectedContaId(null);
      await carregarDespesas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir despesa');
    }
  };

  const fillEntradaForm = (item: Entrada) => {
    const [day, month, year] = item.data.split('/');
    const dataFormatada = day && month && year ? `${year}-${month}-${day}` : item.data;
    setEntradaForm({
      data: dataFormatada,
      descricao: item.descricao || '',
      categoria: item.categoria || 'Serviços',
      valor: item.valor ? formatCurrency(item.valor) : '',
    });
    setSelectedEntradaId(item.id);
  };

  const deleteEntrada = async () => {
    if (!selectedEntradaId) return;
    try {
      setError(null);
      await deleteJSON(`/entradas/${selectedEntradaId}`);
      setEntradaForm({ data: '', descricao: '', categoria: 'Serviços', valor: '' });
      setSelectedEntradaId(null);
      await carregarEntradas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir entrada');
    }
  };

  const fillSaidaForm = (item: SaidaUI) => {
    const [day, month, year] = item.data.split('/');
    const dataFormatada = day && month && year ? `${year}-${month}-${day}` : item.data;
    setSaidaForm({
      data: dataFormatada,
      descricao: item.descricao || '',
      categoria: item.categoria || 'Água',
      forma: item.forma || 'PIX',
      valor: item.valor ? formatCurrency(item.valor) : '',
    });
    setSelectedSaidaId(item.id);
  };

  const deleteSaida = async () => {
    if (!selectedSaidaId) return;
    try {
      setError(null);
      await deleteJSON(`/saidas/${selectedSaidaId}`);
      setSaidaForm({ data: '', descricao: '', categoria: 'Água', forma: 'PIX', valor: '' });
      setSelectedSaidaId(null);
      await carregarSaidas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir saída');
    }
  };

  const BrandMark = ({ small = false }: { small?: boolean }) => (
    <div
      className={`relative ${small ? 'h-11 w-11' : 'h-14 w-14'} rounded-[20px] bg-gradient-to-br from-emerald-400 via-blue-500 to-indigo-600 shadow-[0_14px_30px_rgba(37,99,235,0.30)] flex items-center justify-center overflow-hidden`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.35),transparent_48%)]" />
      <Landmark className={`${small ? 'h-5 w-5' : 'h-7 w-7'} text-white relative z-10`} />
    </div>
  );

  const TopActions = () => (
    <div className="flex flex-wrap gap-3">
      <select
        value={periodo}
        onChange={(e) => setPeriodo(e.target.value)}
        className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-sm px-4 py-3 text-sm font-medium text-slate-700 shadow-sm"
      >
        {periodOptions.map((option) => (
          <option key={option.label} value={option.label}>
            {option.label}
          </option>
        ))}
      </select>
      <button onClick={exportDashboardExcel} className={`${primaryButtonClass} bg-gradient-to-r from-slate-900 to-slate-700`}>
        Exportar Excel
      </button>
      <button onClick={exportDashboardPdf} className={`${primaryButtonClass} bg-gradient-to-r from-rose-600 to-red-500`}>
        Exportar PDF
      </button>
    </div>
  );

  const BackButton = () => (
    <div className="mb-5 flex justify-start">
      <button onClick={() => setActiveView('Dashboard')} className={secondaryButtonClass}>
        ← Voltar para Dashboard
      </button>
    </div>
  );

  const renderDashboard = () => (
    <>
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6 items-stretch">
        <div className={`${cardClass} h-full min-h-[170px] flex flex-col justify-between bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white border-slate-800`}>
          <p className="text-sm text-slate-300 leading-snug">Saldo Inicial</p>
          <div className="flex items-center justify-between gap-4">
            <h3 className="w-full text-[clamp(1.45rem,2.2vw,2rem)] font-bold leading-tight break-words">{formatCurrency(totais.saldoInicial)}</h3>
            <Wallet className="h-10 w-10 text-emerald-300" />
          </div>
        </div>
        <div className={`${cardClass} h-full min-h-[170px] flex flex-col justify-between`}>
          <p className="text-sm text-slate-500 leading-snug">Total de Entradas</p>
          <div className="flex items-center justify-between gap-4">
            <h3 className="w-full text-[clamp(1.45rem,2.2vw,2rem)] font-bold leading-tight break-words text-emerald-600">{formatCurrency(totais.totalEntradas)}</h3>
            <ArrowUpCircle className="h-10 w-10 text-emerald-500" />
          </div>
        </div>
        <div className={`${cardClass} h-full min-h-[170px] flex flex-col justify-between`}>
          <p className="text-sm text-slate-500 leading-snug">Total de Saídas</p>
          <div className="flex items-center justify-between gap-4">
            <h3 className="w-full text-[clamp(1.45rem,2.2vw,2rem)] font-bold leading-tight break-words text-red-600">{formatCurrency(totais.totalSaidas)}</h3>
            <ArrowDownCircle className="h-10 w-10 text-rose-500" />
          </div>
        </div>
        <div className={`${cardClass} h-full min-h-[170px] flex flex-col justify-between`}>
          <p className="text-sm text-slate-500 leading-snug">Saldo Atual</p>
          <div className="flex items-center justify-between gap-4">
            <h3 className="w-full text-[clamp(1.45rem,2.2vw,2rem)] font-bold leading-tight break-words text-blue-600">{formatCurrency(totais.saldoAtual)}</h3>
            <BarChart3 className="h-10 w-10 text-blue-500" />
          </div>
        </div>
        <div className={`${cardClass} h-full min-h-[170px] flex flex-col justify-between bg-gradient-to-br from-violet-50 to-indigo-50`}>
          <p className="text-sm text-slate-500 leading-snug">Cartão de Crédito</p>
          <div className="flex items-center justify-between gap-4">
            <h3 className="w-full text-[clamp(1.45rem,2.2vw,2rem)] font-bold leading-tight break-words text-violet-600">{formatCurrency(totais.totalCartaoCredito)}</h3>
            <CreditCard className="h-10 w-10 text-violet-500" />
          </div>
        </div>
      </section>

      <section className={`${glassCardClass} p-6 md:p-7 mb-8 overflow-hidden relative`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.10),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.10),transparent_24%)] pointer-events-none" />
        <div className="relative z-10">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5 mb-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/90 border border-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm mb-3">
                Visão Analítica
              </div>
              <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">Grafíco de Entradas & Saídas</h3>
              <p className="text-sm md:text-base text-slate-500 mt-2">
                Comparativo visual da performance financeira com barras mensais e linha de progressão.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="rounded-full bg-emerald-50/90 px-3 py-2 text-xs font-semibold text-emerald-700 border border-emerald-100 shadow-sm">Entradas</div>
              <div className="rounded-full bg-blue-50/90 px-3 py-2 text-xs font-semibold text-blue-700 border border-blue-100 shadow-sm">Saídas</div>
              <div className="rounded-full bg-amber-50/90 px-3 py-2 text-xs font-semibold text-amber-700 border border-amber-100 shadow-sm">Linha de Progressão</div>
              <div className="rounded-full bg-white/90 px-3 py-2 text-xs font-semibold text-slate-600 border border-slate-200 shadow-sm">
                Período atual: {periodo}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <div className="rounded-[24px] bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 text-white shadow-[0_18px_34px_rgba(16,185,129,0.28)]">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-100">Maior entrada</p>
              <p className="text-2xl font-bold mt-3">{formatCurrency(maxEntradaChart)}</p>
            </div>
            <div className="rounded-[24px] bg-gradient-to-br from-blue-500 to-indigo-600 p-5 text-white shadow-[0_18px_34px_rgba(59,130,246,0.28)]">
              <p className="text-xs uppercase tracking-[0.18em] text-blue-100">Maior saída</p>
              <p className="text-2xl font-bold mt-3">{formatCurrency(maxSaidaChart)}</p>
            </div>
            <div className="rounded-[24px] bg-white/95 border border-slate-200 p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Entrada atual</p>
              <p className="text-2xl font-bold text-slate-900 mt-3">{formatCurrency(totais.totalEntradas)}</p>
            </div>
            <div className="rounded-[24px] bg-white/95 border border-slate-200 p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Saída atual</p>
              <p className="text-2xl font-bold text-slate-900 mt-3">{formatCurrency(totais.totalSaidas)}</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/80 bg-white/75 backdrop-blur-md p-4 md:p-5 shadow-[0_20px_50px_rgba(15,23,42,0.10)]">
            <div className="h-[410px] w-full rounded-[22px] bg-[linear-gradient(180deg,rgba(248,250,252,0.95)_0%,rgba(255,255,255,0.96)_100%)] p-3 md:p-4 border border-slate-100">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={fluxoMensalChart} margin={{ top: 18, right: 24, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="barEntradaModern" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#16a34a" stopOpacity={0.85} />
                    </linearGradient>
                    <linearGradient id="barSaidaModern" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: '#64748B', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: '#64748B', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => `R$ ${Number(value).toLocaleString('pt-BR')}`}
                    width={92}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '18px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 18px 40px rgba(15,23,42,0.12)',
                      backgroundColor: 'rgba(255,255,255,0.96)',
                    }}
                    formatter={(value, name) => [formatCurrency(Number(value)), String(name)]}
                    labelStyle={{ color: '#0F172A', fontWeight: 700 }}
                  />
                  <Legend wrapperStyle={{ paddingTop: 14 }} iconType="circle" />
                  <Bar dataKey="entradas" name="Entradas" fill="url(#barEntradaModern)" radius={[10, 10, 0, 0]} barSize={26} />
                  <Bar dataKey="saidas" name="Saídas" fill="url(#barSaidaModern)" radius={[10, 10, 0, 0]} barSize={26} />
                  <Line
                    type="monotone"
                    dataKey="progresso"
                    name="Progressão"
                    stroke="#f59e0b"
                    strokeWidth={4}
                    dot={{ r: 4.5, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }}
                    activeDot={{ r: 7 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <div className="rounded-[30px] bg-white/80 backdrop-blur-md shadow-[0_20px_50px_rgba(15,23,42,0.10)] border border-white/80 overflow-hidden">
          <div className="px-5 md:px-6 py-5 border-b border-slate-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.88)_0%,rgba(248,250,252,0.92)_100%)]">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-3">
                  Histórico Financeiro
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-slate-900">Movimentações Recentes</h3>
                <p className="text-sm text-slate-500 mt-2">Top 10 movimentações mais recentes do período</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 border border-emerald-100">Recebido</div>
                <div className="rounded-full bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 border border-blue-100">Pago</div>
                <button
                  onClick={() => setActiveView('Entradas')}
                  className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-500 text-white px-3 py-2.5 text-sm font-semibold shadow-[0_12px_24px_rgba(59,130,246,0.24)]"
                >
                  Nova Entrada
                </button>
                <button
                  onClick={() => setActiveView('Saídas')}
                  className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 text-white px-3 py-2.5 text-sm font-semibold shadow-[0_12px_24px_rgba(15,23,42,0.18)]"
                >
                  Nova Saída
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto px-3 md:px-4 py-4">
            <table className="w-full min-w-[860px] border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-3 px-3 font-semibold">Data</th>
                  <th className="py-3 px-3 font-semibold">Tipo</th>
                  <th className="py-3 px-3 font-semibold">Descrição</th>
                  <th className="py-3 px-3 font-semibold">Categoria</th>
                  <th className="py-3 px-3 font-semibold">Valor</th>
                  <th className="py-3 px-3 font-semibold">Forma</th>
                  <th className="py-3 px-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.map((item) => (
                  <tr key={item.id} className={`${movimentoRowClass(item.status)} transition shadow-sm`}>
                    <td className="py-3 px-3 rounded-l-2xl font-medium text-slate-700">{item.data}</td>
                    <td className="py-3 px-3 text-slate-600">{item.tipo}</td>
                    <td className="py-3 px-3 font-semibold text-slate-900">{item.descricao}</td>
                    <td className="py-3 px-3 text-slate-600">{item.categoria}</td>
                    <td className="py-3 px-3 font-semibold text-slate-900">{item.valor}</td>
                    <td className="py-3 px-3 text-slate-600">{item.forma}</td>
                    <td className="py-3 px-3 rounded-r-2xl">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );

  const renderEntradas = () => (
    <div>
      <BackButton />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 rounded-2xl bg-white shadow-sm border border-slate-200 p-5">
          <div className="mb-4 pb-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold">Cadastrar Entrada</h3>
            <p className="text-sm text-slate-500 mt-1">Campos exclusivos para lançamentos de receitas.</p>
            {selectedEntradaId && <p className="text-xs text-blue-600 mt-2">Editando entrada selecionada da listagem.</p>}
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Data</label>
              <input
                className={inputClass}
                type="date"
                value={entradaForm.data}
                onChange={(e) => setEntradaForm({ ...entradaForm, data: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
              <input
                className={inputClass}
                placeholder="Ex.: Recebimento de cliente"
                value={entradaForm.descricao}
                onChange={(e) => setEntradaForm({ ...entradaForm, descricao: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
              <select
                className={inputClass}
                value={entradaForm.categoria}
                onChange={(e) => setEntradaForm({ ...entradaForm, categoria: e.target.value })}
              >
                {categoriasEntrada.map((categoria) => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Valor (Em Reais)</label>
              <input
                className={inputClass}
                placeholder="R$ 100.000,00"
                type="text"
                inputMode="numeric"
                value={entradaForm.valor}
                onChange={(e) =>
                  setEntradaForm({
                    ...entradaForm,
                    valor: formatCurrencyInput(e.target.value),
                  })
                }
              />
            </div>
            {selectedEntradaId ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={addEntrada} className="w-full rounded-xl bg-blue-600 text-white px-4 py-3 text-sm font-medium">
                  Atualizar Entrada
                </button>
                <button onClick={deleteEntrada} className="w-full rounded-xl bg-red-600 text-white px-4 py-3 text-sm font-medium">
                  Excluir Entrada
                </button>
              </div>
            ) : (
              <button onClick={addEntrada} className="w-full rounded-xl bg-blue-600 text-white px-4 py-3 text-sm font-medium">
                Salvar Entrada
              </button>
            )}
          </div>
        </div>

        <div className="xl:col-span-2 rounded-2xl bg-white shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Listagem de Entradas</h3>
              <p className="text-sm text-slate-500 mt-1">Visualização apenas de receitas cadastradas.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={exportEntradasExcel} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                Exportar Excel
              </button>
              <button onClick={exportEntradasPdf} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                Exportar PDF
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-3 pr-3">Data</th>
                  <th className="py-3 pr-3">Descrição</th>
                  <th className="py-3 pr-3">Categoria</th>
                  <th className="py-3 pr-3">Valor</th>
                  <th className="py-3 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...entradas]
                  .sort((a, b) => {
                    const [da, ma, aa] = a.data.split('/').map(Number);
                    const [db, mb, ab] = b.data.split('/').map(Number);
                    return new Date(ab, mb - 1, db).getTime() - new Date(aa, ma - 1, da).getTime();
                  })
                  .slice(0, 6)
                  .map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => fillEntradaForm(item)}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-3 pr-3">{item.data}</td>
                      <td className="py-3 pr-3 font-medium">{item.descricao}</td>
                      <td className="py-3 pr-3">{item.categoria}</td>
                      <td className="py-3 pr-3">{formatCurrency(item.valor)}</td>
                      <td className="py-3 pr-3">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusClass(item.status || 'Recebido')}`}>
                          {item.status || 'Recebido'}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const saidasResumo = useMemo(() => {
    const totalSaidas = saidas.reduce((acc, item) => acc + Number(item.valor || 0), 0);

    const categoriaContagem = saidas.reduce<Record<string, number>>((acc, item) => {
      acc[item.categoria] = (acc[item.categoria] || 0) + 1;
      return acc;
    }, {});

    const categoriaMaisRecorrenteEntry = Object.entries(categoriaContagem).sort((a, b) => b[1] - a[1])[0];
    const categoriaMaisRecorrente = categoriaMaisRecorrenteEntry
      ? `${categoriaMaisRecorrenteEntry[0]} • ${categoriaMaisRecorrenteEntry[1]} itens`
      : 'Sem dados';

    const maiorCusto = saidas.length
      ? saidas.reduce((maior, item) => (Number(item.valor || 0) > Number(maior.valor || 0) ? item : maior), saidas[0])
      : null;

    const menorCusto = saidas.length
      ? saidas.reduce((menor, item) => (Number(item.valor || 0) < Number(menor.valor || 0) ? item : menor), saidas[0])
      : null;

    return {
      totalSaidas,
      categoriaMaisRecorrente,
      maiorCusto,
      menorCusto,
    };
  }, [saidas]);

  const renderSaidas = () => (
    <div>
      <BackButton />
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-6 items-stretch">
        <div className="rounded-[28px] bg-white/88 backdrop-blur-sm border border-slate-200 shadow-[0_16px_40px_rgba(15,23,42,0.06)] overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-rose-200 via-red-200 to-pink-200" />
          <div className="p-5 h-full min-h-[150px] flex flex-col justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Saídas</p>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Total de Saídas</h3>
              <p className="text-3xl font-bold text-red-600 mt-4">{formatCurrency(saidasResumo.totalSaidas)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] bg-white/88 backdrop-blur-sm border border-slate-200 shadow-[0_16px_40px_rgba(15,23,42,0.06)] overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-amber-200 via-orange-200 to-yellow-200" />
          <div className="p-5 h-full min-h-[150px] flex flex-col justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Categoria + Reincidente</p>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Mais recorrente</h3>
              <p className="text-xl font-bold text-amber-600 mt-4">{saidasResumo.categoriaMaisRecorrente}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] bg-white/88 backdrop-blur-sm border border-slate-200 shadow-[0_16px_40px_rgba(15,23,42,0.06)] overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-violet-200 via-fuchsia-200 to-pink-200" />
          <div className="p-5 h-full min-h-[150px] flex flex-col justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Categoria com Maior Custo</p>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{saidasResumo.maiorCusto?.categoria || 'Sem dados'}</h3>
              <p className="text-2xl font-bold text-violet-600 mt-4">
                {saidasResumo.maiorCusto ? formatCurrency(saidasResumo.maiorCusto.valor) : 'R$ 0,00'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] bg-white/88 backdrop-blur-sm border border-slate-200 shadow-[0_16px_40px_rgba(15,23,42,0.06)] overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-emerald-200 via-teal-200 to-cyan-200" />
          <div className="p-5 h-full min-h-[150px] flex flex-col justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Categoria com Menor Custo</p>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{saidasResumo.menorCusto?.categoria || 'Sem dados'}</h3>
              <p className="text-2xl font-bold text-emerald-600 mt-4">
                {saidasResumo.menorCusto ? formatCurrency(saidasResumo.menorCusto.valor) : 'R$ 0,00'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 rounded-2xl bg-white shadow-sm border border-slate-200 p-5">
          <div className="mb-4 pb-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold">Cadastrar Saída</h3>
            <p className="text-sm text-slate-500 mt-1">Campos exclusivos para lançamentos de despesas.</p>
            {selectedSaidaId && <p className="text-xs text-blue-600 mt-2">Editando saída selecionada da listagem.</p>}
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Data</label>
              <input
                className={inputClass}
                type="date"
                value={saidaForm.data}
                onChange={(e) => setSaidaForm({ ...saidaForm, data: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
              <input
                className={inputClass}
                placeholder="Ex.: Pagamento de fornecedor"
                value={saidaForm.descricao}
                onChange={(e) => setSaidaForm({ ...saidaForm, descricao: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
              <select
                className={inputClass}
                value={saidaForm.categoria}
                onChange={(e) => setSaidaForm({ ...saidaForm, categoria: e.target.value })}
              >
                {categoriasSaida.map((categoria) => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Forma de Pagamento</label>
              <select
                className={inputClass}
                value={saidaForm.forma}
                onChange={(e) => setSaidaForm({ ...saidaForm, forma: e.target.value })}
              >
                {formasPagamento.map((forma) => (
                  <option key={forma} value={forma}>
                    {forma}
                  </option>
                ))}
              </select>
              {saidaForm.forma === 'Cartão de Crédito' && (
                <p className="mt-2 text-xs text-violet-600">
                  Lançamentos em Cartão de Crédito serão apenas registrados e não debitarão do saldo atual.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Valor (Em Reais)</label>
              <input
                className={inputClass}
                placeholder="R$ 100.000,00"
                type="text"
                inputMode="numeric"
                value={saidaForm.valor}
                onChange={(e) =>
                  setSaidaForm({
                    ...saidaForm,
                    valor: formatCurrencyInput(e.target.value),
                  })
                }
              />
            </div>
            {selectedSaidaId ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={addSaida} className="w-full rounded-xl bg-slate-900 text-white px-4 py-3 text-sm font-medium">
                  Atualizar Saída
                </button>
                <button onClick={deleteSaida} className="w-full rounded-xl bg-red-600 text-white px-4 py-3 text-sm font-medium">
                  Excluir Saída
                </button>
              </div>
            ) : (
              <button onClick={addSaida} className="w-full rounded-xl bg-slate-900 text-white px-4 py-3 text-sm font-medium">
                Salvar Saída
              </button>
            )}
          </div>
        </div>

        <div className="xl:col-span-2 rounded-2xl bg-white shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Listagem de Saídas</h3>
              <p className="text-sm text-slate-500 mt-1">Visualização apenas de despesas cadastradas.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={exportSaidasExcel} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                Exportar Excel
              </button>
              <button onClick={exportSaidasPdf} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                Exportar PDF
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-3 pr-3">Data</th>
                  <th className="py-3 pr-3">Descrição</th>
                  <th className="py-3 pr-3">Categoria</th>
                  <th className="py-3 pr-3">Forma de Pagamento</th>
                  <th className="py-3 pr-3">Valor</th>
                  <th className="py-3 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {saidas.slice(0, 6).map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => fillSaidaForm(item)}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="py-3 pr-3">{item.data}</td>
                    <td className="py-3 pr-3 font-medium">{item.descricao}</td>
                    <td className="py-3 pr-3">{item.categoria}</td>
                    <td className="py-3 pr-3">{item.forma}</td>
                    <td className="py-3 pr-3">{formatCurrency(item.valor)}</td>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusClass(item.status || 'Pago')}`}>
                        {item.status || 'Pago'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContasMes = () => (
    <div>
      <BackButton />
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6 items-stretch">
        <div className="rounded-[28px] bg-white/88 backdrop-blur-sm border border-slate-200 shadow-[0_16px_40px_rgba(15,23,42,0.06)] overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-amber-200 via-orange-200 to-rose-200" />
          <div className="p-5 h-full min-h-[150px] flex flex-col justify-between">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Despesas do Mês</p>
                <h3 className="text-lg font-bold text-slate-900 mt-2">Em Aberto</h3>
              </div>
              <div className="h-11 w-11 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 shadow-sm">
                <Wallet className="h-5 w-5" />
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900 mt-4">{totais.totalContasPagar}</p>
              <p className="text-sm text-slate-500 mt-2">Total de despesas ainda pendentes no período selecionado.</p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] bg-white/88 backdrop-blur-sm border border-slate-200 shadow-[0_16px_40px_rgba(15,23,42,0.06)] overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-rose-200 via-red-200 to-pink-200" />
          <div className="p-5 h-full min-h-[150px] flex flex-col justify-between">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Despesas do Mês</p>
                <h3 className="text-lg font-bold text-slate-900 mt-2">Vencidas</h3>
              </div>
              <div className="h-11 w-11 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 shadow-sm">
                <ArrowDownCircle className="h-5 w-5" />
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900 mt-4">{totais.totalContasVencidas}</p>
              <p className="text-sm text-slate-500 mt-2">Despesas com vencimento expirado e que ainda não foram pagas.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 rounded-2xl bg-white shadow-sm border border-slate-200 p-5">
          <div className="mb-4 pb-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold">Cadastrar Despesas</h3>
            <p className="text-sm text-slate-500 mt-1">Cadastre sua despesa para acompanhamento e pagamento.</p>
            {selectedContaId && <p className="text-xs text-blue-600 mt-2">Editando despesa selecionada da listagem.</p>}
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Despesas do Mês</label>
              <select
                className={inputClass}
                value={contaForm.contaMes}
                onChange={(e) => setContaForm({ ...contaForm, contaMes: e.target.value })}
              >
                {categoriasSaida.map((categoria) => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
              <input
                className={inputClass}
                placeholder="Ex.: Conta de energia da residência"
                value={contaForm.descricao}
                onChange={(e) => setContaForm({ ...contaForm, descricao: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Data de Vencimento</label>
              <input
                className={inputClass}
                type="date"
                value={contaForm.vencimento}
                onChange={(e) => setContaForm({ ...contaForm, vencimento: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Forma de Pagamento</label>
              <select
                className={inputClass}
                value={contaForm.formaPagamento}
                onChange={(e) => setContaForm({ ...contaForm, formaPagamento: e.target.value })}
              >
                {formasPagamento
                  .filter((forma) => forma !== 'Cartão de Crédito')
                  .map((forma) => (
                    <option key={forma} value={forma}>
                      {forma}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Valor (Em Reais)</label>
              <input
                className={inputClass}
                placeholder="R$ 100.000,00"
                type="text"
                inputMode="numeric"
                value={contaForm.valor}
                onChange={(e) =>
                  setContaForm({
                    ...contaForm,
                    valor: formatCurrencyInput(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={contaForm.status === 'Pendente'}
                    onChange={() => setContaForm({ ...contaForm, status: 'Pendente' })}
                  />
                  Pendente
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={contaForm.status === 'Pago'}
                    onChange={() => setContaForm({ ...contaForm, status: 'Pago' })}
                  />
                  Pago
                </label>
              </div>
            </div>
            {selectedContaId ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={addConta} className="w-full rounded-xl bg-amber-500 text-white px-4 py-3 text-sm font-medium">
                  Atualizar Despesa
                </button>
                <button onClick={deleteConta} className="w-full rounded-xl bg-red-600 text-white px-4 py-3 text-sm font-medium">
                  Excluir Despesa
                </button>
              </div>
            ) : (
              <button onClick={addConta} className="w-full rounded-xl bg-amber-500 text-white px-4 py-3 text-sm font-medium">
                Salvar Despesa
              </button>
            )}
          </div>
        </div>

        <div className="xl:col-span-2 rounded-2xl bg-white shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Listagem de Despesas do Mês</h3>
              <p className="text-sm text-slate-500 mt-1">Visualização das últimas despesas cadastradas.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={exportContasExcel} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                Exportar Excel
              </button>
              <button onClick={exportContasPdf} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                Exportar PDF
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-3 pr-3">Despesas do Mês</th>
                  <th className="py-3 pr-3">Descrição</th>
                  <th className="py-3 pr-3">Forma de Pagamento</th>
                  <th className="py-3 pr-3">Data de Vencimento</th>
                  <th className="py-3 pr-3">Valor</th>
                  <th className="py-3 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {contasPagar.slice(0, 6).map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => fillContaForm(item)}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="py-3 pr-3 font-medium">{item.contaMes}</td>
                    <td className="py-3 pr-3">{item.descricao}</td>
                    <td className="py-3 pr-3">{item.formaPagamento}</td>
                    <td className="py-3 pr-3">{item.vencimento}</td>
                    <td className="py-3 pr-3">{formatCurrency(item.valor)}</td>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusClass(getContaStatus(item))}`}>
                        {getContaStatus(item)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const reportCards = [
    {
      titulo: 'Resumo Mensal',
      desc: 'Consolidado de entradas, saídas e saldo do período.',
      onExcel: exportResumoMensalExcel,
      onPdf: exportResumoMensalPdf,
    },
    {
      titulo: 'Despesas do Mês',
      desc: 'Listagem das despesas mensais cadastradas com status pendente ou pago.',
      onExcel: exportContasExcel,
      onPdf: exportContasPdf,
    },
    {
      titulo: 'Entradas por Categoria',
      desc: 'Agrupamento das receitas por categoria.',
      onExcel: exportEntradasCategoriaExcel,
      onPdf: exportEntradasCategoriaPdf,
    },
    {
      titulo: 'Saídas por Categoria',
      desc: 'Agrupamento das despesas por categoria.',
      onExcel: exportSaidasCategoriaExcel,
      onPdf: exportSaidasCategoriaPdf,
    },
  ];

  const renderRelatorios = () => (
    <div>
      <BackButton />
      <section className="mb-6 rounded-[30px] bg-[linear-gradient(135deg,rgba(15,23,42,0.96)_0%,rgba(30,41,59,0.92)_52%,rgba(37,99,235,0.88)_100%)] text-white shadow-[0_24px_70px_rgba(15,23,42,0.24)] overflow-hidden">
        <div className="px-6 md:px-8 py-7 md:py-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100 mb-3">
              Central de Relatórios
            </div>
            <h3 className="text-2xl md:text-3xl font-bold tracking-tight">Exporte seus relatórios com rapidez</h3>
            <p className="text-sm md:text-base text-slate-200 mt-2 max-w-2xl">
              Acesse visões consolidadas do período e exporte dados em Excel ou PDF com um visual mais moderno e organizado.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 min-w-[260px]">
            <div className="rounded-[24px] bg-white/10 border border-white/10 px-4 py-4 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-blue-100">Período</p>
              <select
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/15 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
              >
                {periodOptions.map((option) => (
                  <option key={option.label} value={option.label}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-[24px] bg-white/10 border border-white/10 px-4 py-4 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-blue-100">Exportações</p>
              <p className="text-lg font-bold mt-2">Excel + PDF</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {reportCards.map((item, index) => {
          const accentStyles = [
            {
              chip: 'from-emerald-500 to-teal-500',
              iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
              border: 'hover:border-emerald-200',
              glow: 'hover:shadow-[0_20px_50px_rgba(16,185,129,0.14)]',
            },
            {
              chip: 'from-blue-500 to-indigo-500',
              iconBg: 'bg-blue-50 text-blue-600 border-blue-100',
              border: 'hover:border-blue-200',
              glow: 'hover:shadow-[0_20px_50px_rgba(59,130,246,0.14)]',
            },
            {
              chip: 'from-violet-500 to-fuchsia-500',
              iconBg: 'bg-violet-50 text-violet-600 border-violet-100',
              border: 'hover:border-violet-200',
              glow: 'hover:shadow-[0_20px_50px_rgba(139,92,246,0.14)]',
            },
            {
              chip: 'from-amber-500 to-orange-500',
              iconBg: 'bg-amber-50 text-amber-600 border-amber-100',
              border: 'hover:border-amber-200',
              glow: 'hover:shadow-[0_20px_50px_rgba(245,158,11,0.14)]',
            },
          ];
          const style = accentStyles[index % accentStyles.length];

          return (
            <div
              key={item.titulo}
              className={`group rounded-[30px] bg-white/88 backdrop-blur-sm border border-white/80 ${style.border} ${style.glow} shadow-[0_18px_50px_rgba(15,23,42,0.08)] overflow-hidden transition duration-300 hover:-translate-y-1`}
            >
              <div className={`h-1.5 w-full bg-gradient-to-r ${style.chip}`} />
              <div className="p-5 md:p-6">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <div className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${style.iconBg}`}>
                      Relatório
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mt-4 leading-tight">{item.titulo}</h3>
                    <p className="text-sm text-slate-500 mt-2 leading-relaxed">{item.desc}</p>
                  </div>
                </div>

                <div className="rounded-[24px] bg-slate-50/90 border border-slate-100 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold mb-3">Opções de exportação</p>
                  <div className="grid grid-cols-1 gap-3">
                    <button
                      onClick={item.onExcel}
                      className="group rounded-[20px] bg-white border border-emerald-100/80 px-4 py-3.5 text-sm font-semibold text-emerald-700 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-50/80 hover:shadow-[0_14px_28px_rgba(16,185,129,0.10)]"
                    >
                      <span className="flex items-center justify-center gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 transition group-hover:bg-emerald-100">
                          ↗
                        </span>
                        Exportar Excel
                      </span>
                    </button>
                    <button
                      onClick={item.onPdf}
                      className="group rounded-[20px] bg-white border border-rose-100/80 px-4 py-3.5 text-sm font-semibold text-rose-700 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition duration-200 hover:-translate-y-0.5 hover:bg-rose-50/80 hover:shadow-[0_14px_28px_rgba(244,63,94,0.10)]"
                    >
                      <span className="flex items-center justify-center gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 border border-rose-100 text-rose-600 transition group-hover:bg-rose-100">
                          ↗
                        </span>
                        Exportar PDF
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderView = () => {
    switch (activeView) {
      case 'Entradas':
        return renderEntradas();
      case 'Saídas':
        return renderSaidas();
      case 'Despesas do Mês':
        return renderContasMes();
      case 'Relatórios':
        return renderRelatorios();
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.14),_transparent_24%),linear-gradient(180deg,_#f8fbff_0%,_#eef4fb_100%)] text-slate-800">
      <div className="md:hidden sticky top-0 z-20 bg-slate-950/95 backdrop-blur-md text-white border-b border-white/10">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <BrandMark small />
              <div>
                <h1 className="text-lg font-bold">Fluxo de Caixa</h1>
                <p className="text-slate-400 text-xs mt-0.5">Painel financeiro inteligente</p>
              </div>
            </div>
            <select
              value={activeView}
              onChange={(e) => setActiveView(e.target.value)}
              className="rounded-2xl bg-white text-slate-900 px-3 py-2 text-sm font-medium min-w-[180px] shadow-sm"
            >
              {menuItems.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex">
        <aside className="w-80 min-h-screen bg-slate-950 text-white p-6 hidden md:block border-r border-white/10">
          <div className="mb-10 flex items-center gap-4">
            <BrandMark />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Fluxo de Caixa</h1>
              <p className="text-slate-400 text-sm mt-1">Controle Financeiro</p>
            </div>
          </div>
          <div className="rounded-[28px] bg-white/5 p-3">
            <nav className="space-y-2">
              {menuItems.map((item) => (
                <button
                  key={item}
                  onClick={() => setActiveView(item)}
                  className={`w-full text-left px-4 py-3 rounded-2xl transition font-medium ${
                    item === activeView
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-500 text-white shadow-[0_12px_30px_rgba(59,130,246,0.25)]'
                      : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {item}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
          <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between mb-8">
            <div className="flex items-start gap-4">
              <BrandMark />
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/80 backdrop-blur-sm border border-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm mb-3">
                  Finance • Smart Dashboard
                </div>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">{activeView}</h2>
                <p className="text-slate-600 mt-2 max-w-2xl">
                  Sistema web para controle financeiro com movimentações de entradas, saídas e relatórios.
                </p>
              </div>
            </div>
            <TopActions />
          </header>

          {loading && (
            <div className="mb-4 rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">
              Carregando dados da API...
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {renderView()}
        </main>
      </div>
    </div>
  );
}