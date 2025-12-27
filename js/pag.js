const API_CONFIG = {
  WORKER_URL: 'https://sublime.mcpemaster620.workers.dev/',
  GAS_URL: 'https://script.google.com/macros/s/AKfycbwHD93akrVoxp2XjjCqZlY7RCG3ydk4Wctv5ETOR80y0qrJv-6f0hw80T9JrLDXpgqa/exec',
  WHATSAPP_NUMBER: '5588988568911',
  ORIGIN_ADDRESS: {
    street: 'Rua Itacy Rodovalho de Alencar, 110',
    neighborhood: 'Veneza',
    city: 'Iguatu',
    state: 'CE',
    cep: '63504-460',
    lat: null, // Será preenchido via geocoding
    lon: null
  }
};

// Taxas de parcelamento (%)
const INSTALLMENT_FEES = {
  1: 0.0379,   // 3.79%
  2: 0.0589,   // 5.89%
  3: 0.0689,   // 6.89%
  4: 0.0789,   // 7.89%
  5: 0.0880,   // 8.80%
  6: 0.0997,   // 9.97%
  7: 0.1289,   // 12.89%
  8: 0.1372,   // 13.72%
  9: 0.1505,   // 15.05%
  10: 0.1586,  // 15.86%
  11: 0.1674,  // 16.74%
  12: 0.1746   // 17.46%
};

/* ============================================
   HELPERS ADICIONADOS
   ============================================ */
// parseCurrency: aceita "R$ 1.234,56", "1234,56", "1234.56", "500" -> retorna Number 1234.56
function parseCurrency(value) {
  if (value === null || value === undefined) return 0;
  let s = String(value).trim();
  s = s.replace(/[R$\s]/g, '');
  const hasComma = s.indexOf(',') !== -1;
  const hasDot = s.indexOf('.') !== -1;
  if (hasComma && hasDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ---------- ADD: normaliza método para enviar ao Worker/GAS ----------
function normalizeMethodForWorker(method) {
  if (!method) return '';
  const m = String(method).toLowerCase();
  if (m.includes('cred')) return 'credito';
  if (m.includes('dinheiro') || m === 'dinheiro') return 'dinheiro';
  if (m.includes('pix')) return 'pix';
  if (m.includes('cartao') || m.includes('cartão') || m.includes('credito')) return 'credito';
  return m;
}


/* ============================================
   ESTADO DO CHECKOUT
   ============================================ */
let checkoutState = {
  currentStep: 1,
  cart: [],
  customer: {
    name: '',
    phone: '',
    
  },
  delivery: {
    type: '', // 'retirada' ou 'entrega'
    // Retirada
    pickupWho: '',
    pickupDate: '',
    pickupTime: '',
    // Entrega
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    lat: null,
    lon: null,
    distanceKm: null,
    shippingCost: null
  },
  payment: {
    method: '', // 'PIX', 'Dinheiro', 'Credito'
    installments: 1,
    changeFor: ''
  },
  coupon: {
    code: null,
    discount: 0,
    valid: false
  },
  subtotal: 0,
  total: 0
};

/* ============================================
   INICIALIZAÇÃO
   ============================================ */
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Inicializando checkout...');
  
  loadTheme();
  loadCart();
  initMasks();
  
  // Geocodificar endereço de origem (para cálculo de distância)
  geocodeOrigin();

  // Gatilho quando usuário muda parcelas
  document.getElementById('installments')?.addEventListener('change', () => {
    updateInstallments();
  });
});

function loadCart() {
  try {
    const savedCart = localStorage.getItem('sublime_cart');
    if (!savedCart || savedCart === '[]') {
      showToast('Carrinho vazio. Redirecionando...', 'error');
      setTimeout(() => window.location.href = '../index.html', 2000);
      return;
    }
    
    checkoutState.cart = JSON.parse(savedCart);
    updateSubtotal();
    renderSummaryItems();
  } catch (error) {
    console.error('Erro ao carregar carrinho:', error);
    showToast('Erro ao carregar carrinho', 'error');
    setTimeout(() => window.location.href = '../index.html', 2000);
  }
}

function updateSubtotal() {
  checkoutState.subtotal = checkoutState.cart.reduce((sum, item) => 
    sum + (parseFloat(item.valor) * item.quantity), 0
  );
  updateTotals();
}

function renderSummaryItems() {
  const container = document.getElementById('summary-items');
  if (!container) return;
  
  const html = checkoutState.cart.map(item => `
    <div class="summary-item">
      <div class="summary-item-details">
        <h4>${item.descricao}</h4>
        <p>${item.cor || 'Padrão'} - Qtd: ${item.quantity}</p>
      </div>
      <div class="summary-item-price">
        R$ ${(parseFloat(item.valor) * item.quantity).toFixed(2)}
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html;
}

function updateTotals() {
  const subtotal = Number(checkoutState.subtotal || 0);

  // Determina desconto monetário (se houver)
  let discountValue = 0;
  if (checkoutState.coupon && checkoutState.coupon.type === 'percent') {
    // checkoutState.coupon.value armazena o percentual (ex: 10)
    const pct = Number(checkoutState.coupon.value || 0);
    if (!isNaN(pct) && pct > 0) {
      discountValue = +(subtotal * (pct / 100)).toFixed(2);
      // manter também o campo discount para compatibilidade com outras partes do código
      checkoutState.coupon.discount = discountValue;
    } else {
      discountValue = Number(checkoutState.coupon.discount || 0);
    }
  } else {

    discountValue = Number(checkoutState.coupon.discount || 0);
  }


  let shippingRaw = checkoutState.delivery.shippingCost;
  let shipping = null;
  

  if (shippingRaw === 'pending') {
    shipping = 'pending';
  } else if (typeof shippingRaw === 'number' && !isNaN(shippingRaw)) {
    shipping = shippingRaw;
  }

  // aceitar dois nomes possíveis para o tipo de frete grátis
  if (checkoutState.coupon && (checkoutState.coupon.type === 'fretegratis' || checkoutState.coupon.type === 'free_shipping')) {
    shipping = 0;
    checkoutState.delivery.shippingCost = 0; // garante estado consistente
  }

  // calcula total final
  const shippingValue = (shipping === 'pending') ? 0 : (shipping || 0);
  const total = +(subtotal - (discountValue || 0) + shippingValue).toFixed(2);

  checkoutState.total = total;

  // atualiza UI (verifica elementos)
  const elSubtotal = document.getElementById('summary-subtotal');
  const elShipping = document.getElementById('summary-shipping');
  const elDiscount = document.getElementById('summary-discount');
  const elTotal = document.getElementById('summary-total');

  if (elSubtotal) elSubtotal.textContent = `R$ ${subtotal.toFixed(2)}`;

  let shippingText;
  if (checkoutState.delivery.type === 'retirada') {
    shippingText = 'Grátis';
  } else if (shipping === 'pending') {
    shippingText = 'A definir';
  } else {
    shippingText = (shipping !== null) ? `R$ ${shipping.toFixed(2)}` : 'Calcular';
  }
  if (elShipping) elShipping.textContent = shippingText;

  if (elDiscount) elDiscount.textContent = (discountValue && discountValue > 0) ? `-R$ ${discountValue.toFixed(2)}` : 'R$ 0,00';

  // se pagamento atual é Crédito e já escolheu parcelas, mostrar total com juros no summary
  const summaryTotalEl = document.getElementById('summary-total');
  if (summaryTotalEl) {
    if (checkoutState.payment.method === 'Credito') {
      const installments = Number(checkoutState.payment.installments || 1);
      const fee = INSTALLMENT_FEES[installments] || 0;
      const totalWithFee = +(total * (1 + fee));
      summaryTotalEl.textContent = `R$ ${totalWithFee.toFixed(2)}`;
    } else {
      summaryTotalEl.textContent = `R$ ${total.toFixed(2)}`;
    }
  }

  
}



/* ============================================
   MÁSCARAS DE INPUT
   ============================================ */
function initMasks() {
  const phoneInput = document.getElementById('customer-phone');
  const cepInputs = [document.getElementById('delivery-cep')];
  
  if (phoneInput) phoneInput.addEventListener('input', (e) => maskPhone(e.target));
  cepInputs.forEach(input => {
    if (input) input.addEventListener('input', (e) => maskCEP(e.target));
  });
}

function maskPhone(input) {
  let value = input.value.replace(/\D/g, '');
  value = value.replace(/^(\d{2})(\d)/g, '($1) $2');
  value = value.replace(/(\d)(\d{4})$/, '$1-$2');
  input.value = value.substr(0, 15);
}



function maskCEP(input) {
  let value = input.value.replace(/\D/g, '');
  value = value.replace(/^(\d{5})(\d)/, '$1-$2');
  input.value = value.substr(0, 9);
}

/* ============================================
   NAVEGAÇÃO ENTRE ETAPAS
   ============================================ */
function nextStep() {
  const currentStep = checkoutState.currentStep;
  
  // Validar etapa atual antes de avançar
  if (!validateStep(currentStep)) {
    return;
  }
  
  // Salvar dados da etapa atual
  saveStepData(currentStep);
  
  // Avançar para próxima etapa
  if (currentStep < 4) {
    goToStep(currentStep + 1);
  }
}

function prevStep() {
  const currentStep = checkoutState.currentStep;
  if (currentStep > 1) {
    goToStep(currentStep - 1);
  }
}

function goToStep(stepNumber) {
  // Esconder todas as etapas
  document.querySelectorAll('.step-content').forEach(el => el.style.display = 'none');
  
  // Mostrar etapa desejada
  const stepEl = document.getElementById(`step-${stepNumber}`);
  if (stepEl) stepEl.style.display = 'block';
  
  // Atualizar indicador visual
  document.querySelectorAll('.step').forEach((el, index) => {
    el.classList.remove('active', 'completed');
    if (index + 1 < stepNumber) {
      el.classList.add('completed');
    } else if (index + 1 === stepNumber) {
      el.classList.add('active');
    }
  });
  
  checkoutState.currentStep = stepNumber;
  
  // Preparar etapa
  prepareStep(stepNumber);
  
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function prepareStep(stepNumber) {
  if (stepNumber === 3) {

    if (checkoutState.delivery.type === 'entrega') {
      const { cost, note } = calculateShippingCost(
        checkoutState.subtotal,
        checkoutState.delivery.distanceKm,
        checkoutState.delivery.city
      );

      checkoutState.delivery.shippingCost = cost;
      checkoutState.delivery.shippingNote = note;
    } else {
      checkoutState.delivery.shippingCost = 0;
    }

    updateTotals();
    renderReviewStep();
    
  }

   if (stepNumber === 4) {
    // garante que total/frete/cupom estejam atualizados antes de gerar opções de parcelamento
    calculateShipping();
    updateTotals();
    updateInstallmentOptions();
    
  }
}

/* ============================================
   VALIDAÇÕES POR ETAPA
   ============================================ */
function validateStep(stepNumber) {
  switch (stepNumber) {
    case 1:
      return validateStep1();
    case 2:
      return validateStep2();
    case 3:
      return true; // Revisão não precisa validação
    case 4:
      return validateStep4();
    default:
      return true;
  }
}

// Etapa 1: Dados Pessoais
function validateStep1() {
  const name = document.getElementById('customer-name').value.trim();
  const phone = document.getElementById('customer-phone').value.trim();
  
  clearErrors();
  
  if (!name) {
    showError('error-name', 'Digite seu nome completo');
    document.getElementById('customer-name').focus();
    return false;
  }
  
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    showError('error-phone', 'Digite um telefone válido');
    document.getElementById('customer-phone').focus();
    return false;
  }
  
  
  return true;
}

// Etapa 2: Recebimento
function validateStep2() {
  const type = checkoutState.delivery.type;
  
  if (!type) {
    showToast('Selecione como deseja receber', 'error');
    return false;
  }
  
  if (type === 'retirada') {
    const who = document.getElementById('pickup-who').value.trim();
    const date = document.getElementById('pickup-date').value;
    const time = document.getElementById('pickup-time').value;
    
    clearErrors();
    
    if (!who) {
      showError('error-pickup-who', 'Digite quem vai retirar');
      return false;
    }
    if (!date) {
      showError('error-pickup-date', 'Selecione a data');
      return false;
    }
    if (!time) {
      showError('error-pickup-time', 'Selecione o horário');
      return false;
    }
    
    return true;
  } else {
    // Entrega
    const cep = document.getElementById('delivery-cep').value.trim();
    const street = document.getElementById('delivery-street').value.trim();
    const number = document.getElementById('delivery-number').value.trim();
    const neighborhood = document.getElementById('delivery-neighborhood').value.trim();
    const city = document.getElementById('delivery-city').value.trim();
    const state = document.getElementById('delivery-state').value;
    
    clearErrors();
    
    if (!cep || cep.replace(/\D/g, '').length !== 8) {
      showError('error-cep', 'Digite um CEP válido');
      return false;
    }
    
    if (!street || !number || !neighborhood || !city || !state) {
      showToast('Preencha todos os campos de endereço', 'error');
      return false;
    }
    
    // Remover validação de frete - será calculado automaticamente na etapa 3
    
    return true;
  }
}

// Etapa 4: Pagamento
function validateStep4() {
  if (!checkoutState.payment.method) {
    showToast('Selecione uma forma de pagamento', 'error');
    return false;
  }

  // Se for Dinheiro e foi informado troco, validar troco >= total
  if (checkoutState.payment.method === 'Dinheiro') {
    const changeInput = document.getElementById('change-for');
    if (changeInput) {
      const given = parseCurrency(changeInput.value);
      if (given > 0) {
        const baseTotal = Number(checkoutState.total || 0);
        if (given < baseTotal) {
          showToast('Valor de troco insuficiente — informe um valor maior ou remova o troco.', 'error');
          return false;
        }
      }
    }
  }
  
  return true;
}

function clearErrors() {
  document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
}

function showError(id, message) {
  const el = document.getElementById(id);
  if (el) el.textContent = message;
}

/* ============================================
   SALVAR DADOS DA ETAPA
   ============================================ */
function saveStepData(stepNumber) {
  if (stepNumber === 1) {
    checkoutState.customer.name = document.getElementById('customer-name').value.trim();
    checkoutState.customer.phone = document.getElementById('customer-phone').value.trim();
  } else if (stepNumber === 2) {
    if (checkoutState.delivery.type === 'retirada') {
      checkoutState.delivery.pickupWho = document.getElementById('pickup-who').value.trim();
      checkoutState.delivery.pickupDate = document.getElementById('pickup-date').value;
      checkoutState.delivery.pickupTime = document.getElementById('pickup-time').value;
    } else {
      checkoutState.delivery.cep = document.getElementById('delivery-cep').value.trim();
      checkoutState.delivery.street = document.getElementById('delivery-street').value.trim();
      checkoutState.delivery.number = document.getElementById('delivery-number').value.trim();
      checkoutState.delivery.complement = document.getElementById('delivery-complement').value.trim();
      checkoutState.delivery.neighborhood = document.getElementById('delivery-neighborhood').value.trim();
      checkoutState.delivery.city = document.getElementById('delivery-city').value.trim();
      checkoutState.delivery.state = document.getElementById('delivery-state').value;
    }
  }
}

/* ============================================
   ETAPA 2: TIPO DE ENTREGA
   ============================================ */
function selectDeliveryType(type) {
  checkoutState.delivery.type = type;
  
  // Atualizar visual
  document.querySelectorAll('.delivery-option').forEach(el => {
    el.classList.remove('selected');
  });
  document.querySelector(`.delivery-option[data-type="${type}"]`).classList.add('selected');
  
  // Mostrar/ocultar campos
  const pickupFields = document.getElementById('pickup-fields');
  const deliveryFields = document.getElementById('delivery-fields');
  
  if (type === 'retirada') {
    pickupFields.style.display = 'block';
    deliveryFields.style.display = 'none';
    checkoutState.delivery.shippingCost = 0;
  } else {
    pickupFields.style.display = 'none';
    deliveryFields.style.display = 'block';
  }
  
  updateTotals();
}

/* ============================================
   BUSCA CEP (ViaCEP)
   ============================================ */
async function searchCEP() {
  const cepInput = document.getElementById('delivery-cep');
  const cep = (cepInput.value || '').replace(/\D/g, '');

  if (cep.length !== 8) {
    showToast('CEP inválido', 'error');
    return;
  }

  showLoading('Buscando CEP...');

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json();

    if (data.erro) {
      throw new Error('CEP não encontrado');
    }

    // Preencher campos
    document.getElementById('delivery-street').value = data.logradouro || '';
    document.getElementById('delivery-neighborhood').value = data.bairro || '';
    document.getElementById('delivery-city').value = data.localidade || '';
    document.getElementById('delivery-state').value = data.uf || '';

    // Salvar no estado
    checkoutState.delivery.cep = cep;
    checkoutState.delivery.street = data.logradouro || '';
    checkoutState.delivery.neighborhood = data.bairro || '';
    checkoutState.delivery.city = data.localidade || '';
    checkoutState.delivery.state = data.uf || '';

    showToast('CEP encontrado!', 'success');

   
  } catch (error) {
    console.error('Erro ao buscar CEP:', error);
    showToast('CEP não encontrado', 'error');
  } finally {
    hideLoading();
  }
}
async function geocodeOrigin() {
  try {
    const address = `${API_CONFIG.ORIGIN_ADDRESS.street}, ${API_CONFIG.ORIGIN_ADDRESS.city}, ${API_CONFIG.ORIGIN_ADDRESS.state}, ${API_CONFIG.ORIGIN_ADDRESS.cep}`;
    const coords = await geocodeAddress(address);
    if (coords) {
      API_CONFIG.ORIGIN_ADDRESS.lat = coords.lat;
      API_CONFIG.ORIGIN_ADDRESS.lon = coords.lon;
      console.log('✅ Origem geocodificada:', coords);
    } else {
      console.warn('⚠️ Não foi possível geocodificar a origem; fallback será usado.');
    }
  } catch (error) {
    console.warn('⚠️ Erro ao geocodificar origem:', error);
  }
}

async function geocodeAddress(address) {
  try {
    // Tentativa direta no Nominatim (sem setar User-Agent — browsers proíbem isso)
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;

    const response = await fetch(url);
    if (!response.ok) {
      console.warn('Geocoding response not ok:', response.status);
      return null;
    }
    const data = await response.json();

    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
    }

    return null;
  } catch (error) {
    console.error('Erro no geocoding:', error);
    return null;
  }
}

/* ============================================
   CÁLCULO DE FRETE
   ============================================ */
async function calculateShipping() {
  // coleta dados do formulário / estado
  const cep = (document.getElementById('delivery-cep')?.value || '').replace(/\D/g, '');
  const street = (document.getElementById('delivery-street')?.value || '').trim();
  const number = (document.getElementById('delivery-number')?.value || '').trim();
  const neighborhood = (document.getElementById('delivery-neighborhood')?.value || '').trim();
  const city = (document.getElementById('delivery-city')?.value || '').trim();
  const state = (document.getElementById('delivery-state')?.value || '').trim();

  // validações básicas
  if (!city || !state || !cep) {
    showToast('Informe CEP, cidade e estado para calcular o frete', 'error');
    return;
  }

  showLoading('Calculando frete...');

  try {
    // tenta geocodificar destino (endereço completo)
    let destCoords = null;
    const fullAddress = `${street} ${number}, ${neighborhood}, ${city} ${state}, ${cep}`;
    if (street && number) {
      destCoords = await geocodeAddress(fullAddress);
    }

    // se não achou com endereço completo, tenta com cidade + cep
    if (!destCoords) {
      destCoords = await geocodeAddress(`${city}, ${state}, ${cep}`);
    }

    // garante origem geocodificada
    if (!API_CONFIG.ORIGIN_ADDRESS.lat || !API_CONFIG.ORIGIN_ADDRESS.lon) {
      await geocodeOrigin();
    }

    let distanceKm = null;

    if (destCoords && API_CONFIG.ORIGIN_ADDRESS.lat && API_CONFIG.ORIGIN_ADDRESS.lon) {
      // calcula distância real (haversine)
      distanceKm = calculateHaversineDistance(
        Number(API_CONFIG.ORIGIN_ADDRESS.lat),
        Number(API_CONFIG.ORIGIN_ADDRESS.lon),
        Number(destCoords.lat),
        Number(destCoords.lon)
      );
      console.log('Distância geocodificada (km):', distanceKm);
    } else {
      // fallback heurístico com base no CEP/cidade caso geocoding falhe
      console.warn('Fallback: usando heurística por CEP/cidade para estimar distância');
      const originCepPrefix = (API_CONFIG.ORIGIN_ADDRESS.cep || '').replace(/\D/g, '').substring(0,5);
      const destCepPrefix = (cep || '').substring(0,5);
      if (originCepPrefix && destCepPrefix && originCepPrefix === destCepPrefix) {
        distanceKm = Math.random() * 2.5; // mesma região: 0-2.5km
      } else if (city && API_CONFIG.ORIGIN_ADDRESS.city && city.toLowerCase() === API_CONFIG.ORIGIN_ADDRESS.city.toLowerCase()) {
        distanceKm = 4 + Math.random() * 3; // mesma cidade, estima 4-7km
      } else {
        distanceKm = 15; // outra cidade / sem dados
      }
      console.log('Distância heurística estimada (km):', distanceKm);
    }

    checkoutState.delivery.distanceKm = distanceKm;

    // calcula custo via função de regras (reuse existing)
    const shippingResult = calculateShippingCost(checkoutState.subtotal || 0, distanceKm, city);
    checkoutState.delivery.shippingCost = shippingResult.cost;

    // Atualiza UI (garantir elementos existem)
    const shippingResultEl = document.getElementById('shipping-result');
    const shippingValueEl = document.getElementById('shipping-value');
    const distanceEl = document.getElementById('distance-km');
    const noteEl = document.getElementById('shipping-note');

    if (distanceEl) distanceEl.textContent = (typeof distanceKm === 'number') ? distanceKm.toFixed(1) : '—';
    if (shippingValueEl) shippingValueEl.textContent = (typeof shippingResult.cost === 'number') ? shippingResult.cost.toFixed(2) : '—';
    if (noteEl) {
      if (shippingResult.note) {
        noteEl.textContent = shippingResult.note;
        noteEl.style.display = 'block';
      } else {
        noteEl.style.display = 'none';
      }
    }
    if (shippingResultEl) shippingResultEl.style.display = 'block';

    updateTotals();
    showToast('Frete calculado!', 'success');

  } catch (err) {
    console.error('Erro ao calcular frete:', err);
    showToast('Erro ao calcular frete. Tente novamente.', 'error');
  } finally {
    hideLoading();
  }
}



function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

/* ============================================
   REGRAS DE FRETE
   ============================================ */
function calculateShippingCost(subtotal, distanceKm, city) {

  // 🔒 Blindagem: distância ainda não calculada
  if (distanceKm === null || distanceKm === undefined || isNaN(distanceKm)) {
    return {
      cost: 'pending',
      note: '⚠️ Distância ainda não calculada. Aguarde a confirmação do endereço.'
    };
  }

  let cost = 0;
  let note = '';

  const originCity = API_CONFIG.ORIGIN_ADDRESS.city
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const destCity = (city || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (originCity !== destCity) {
    return {
      cost: 'pending',
      note: '⚠️ O envio será preparado junto do vendedor.'
    };
  }

  // Iguatu — frete por valor do pedido
  if (subtotal <= 129) {
    cost = 0;
    note = '🎉 Frete grátis!';
  } else if (subtotal <= 200) cost = 1.50;
  else if (subtotal <= 270) cost = 3.00;
  else if (subtotal <= 349) cost = 5.00;
  else if (subtotal <= 419) cost = 7.00;
  else cost = 10.00;

  return { cost, note };
}


/* ============================================
   ETAPA 3: REVISÃO
   ============================================ */
function renderReviewStep() {
  // Produtos
  const itemsHTML = checkoutState.cart.map(item => `
    <div class="review-item">
      <span>${item.quantity}x ${item.descricao} (${item.cor || 'Padrão'})</span>
      <span>R$ ${(parseFloat(item.valor) * item.quantity).toFixed(2)}</span>
    </div>
  `).join('');
  const reviewItemsEl = document.getElementById('review-items');
  if (reviewItemsEl) reviewItemsEl.innerHTML = itemsHTML;

  // Recebimento
  let deliveryHTML = '';
  if (checkoutState.delivery.type === 'retirada') {
    deliveryHTML = `
      <p><strong>Tipo:</strong> Retirada no local</p>
      <p><strong>Quem vai retirar:</strong> ${checkoutState.delivery.pickupWho || ''}</p>
      <p><strong>Data:</strong> ${formatDate(checkoutState.delivery.pickupDate)}</p>
      <p><strong>Horário:</strong> ${checkoutState.delivery.pickupTime || ''}</p>
      <p class="small-text">📍 ${API_CONFIG.ORIGIN_ADDRESS.street}, ${API_CONFIG.ORIGIN_ADDRESS.neighborhood}</p>
    `;
  } else {
    const dist = checkoutState.delivery.distanceKm;
    const distText = (dist === null || dist === undefined) ? '—' : `${Number(dist).toFixed(1)} km`;
    const freight = checkoutState.delivery.shippingCost;
    const freightText = (typeof freight === 'number') ? `R$ ${freight.toFixed(2)}` : '—';

    deliveryHTML = `
      <p><strong>Tipo:</strong> Entrega</p>
      <p><strong>Endereço:</strong> ${checkoutState.delivery.street || ''}, ${checkoutState.delivery.number || ''}</p>
      ${checkoutState.delivery.complement ? `<p><strong>Complemento:</strong> ${checkoutState.delivery.complement}</p>` : ''}
      <p>${checkoutState.delivery.neighborhood || ''}, ${checkoutState.delivery.city || ''}/${checkoutState.delivery.state || ''}</p>
      <p><strong>Frete:</strong> ${freightText}</p>
    `;
  }
  const reviewDeliveryEl = document.getElementById('review-delivery');
  if (reviewDeliveryEl) reviewDeliveryEl.innerHTML = deliveryHTML;

  // Valores
  const shipping = (typeof checkoutState.delivery.shippingCost === 'number') ? checkoutState.delivery.shippingCost : 0;
  const discount = Number(checkoutState.coupon.discount || 0);
  const total = Number(checkoutState.subtotal || 0) + shipping - discount;

  const elSub = document.getElementById('review-subtotal');
  const elShip = document.getElementById('review-shipping');
  const elDisc = document.getElementById('review-discount');
  const elTot = document.getElementById('review-total');

  if (elSub) elSub.textContent = `R$ ${Number(checkoutState.subtotal || 0).toFixed(2)}`;
  if (elShip) elShip.textContent = (typeof checkoutState.delivery.shippingCost === 'number') ? `R$ ${checkoutState.delivery.shippingCost.toFixed(2)}` : '—';
  if (elDisc) elDisc.textContent = discount > 0 ? `-R$ ${discount.toFixed(2)}` : 'R$ 0,00';
  if (elTot) elTot.textContent = `R$ ${total.toFixed(2)}`;
}


function formatDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

/* ============================================
   ETAPA 4: PAGAMENTO
   ============================================ */
function selectPaymentMethod(method) {
  checkoutState.payment.method = method;
  
  // Atualizar visual
  document.querySelectorAll('.payment-method').forEach(el => {
    el.classList.remove('selected');
  });
  document.querySelector(`.payment-method[data-method="${method}"]`).classList.add('selected');
  
  // Mostrar detalhes do método
  document.querySelectorAll('.payment-info').forEach(el => el.style.display = 'none');
  document.getElementById(`info-${method}`).style.display = 'block';
  
  // Se for crédito, atualizar parcelas
  if (method === 'Credito') {
    updateInstallmentOptions();
  } else {
    // se não for crédito, garantir que summary mostra total base
    updateInstallments();
  }
}

function updateInstallmentOptions() {
  const select = document.getElementById('installments');
  if (!select) return;

  const baseTotal = Number(checkoutState.total) || 0;

  // limpar opções antigas
  select.innerHTML = '';

  // sempre gerar 12 opções (1..12) — se baseTotal for 0, mostramos 1x com zeros
  for (let i = 1; i <= 12; i++) {
    const fee = INSTALLMENT_FEES[i] || 0;
    const totalWithFee = +(baseTotal * (1 + fee));
    const installmentValue = (i > 0) ? (totalWithFee / i) : totalWithFee;

    const option = document.createElement('option');
    option.value = i;
    // se baseTotal = 0, evita NaN e exibe 0,00
    option.textContent = baseTotal > 0
      ? `${i}x de R$ ${installmentValue.toFixed(2)} (Total R$ ${totalWithFee.toFixed(2)})`
      : `${i}x de R$ 0,00 (Total R$ 0,00)`;

    option.dataset.total = totalWithFee.toFixed(2);
    select.appendChild(option);
  }

  // manter seleção atual (ou 1 se inválida)
  const current = parseInt(select.dataset.selected || select.value) || 1;
  select.value = (current >= 1 && current <= 12) ? String(current) : '1';

  // atualizar estado e UI
  updateInstallments();
}


function getTotalWithInstallments() {
  if (checkoutState.payment.method !== 'Credito') {
    return checkoutState.total;
  }
  const fee = INSTALLMENT_FEES[checkoutState.payment.installments] || 0;
  return +(checkoutState.total * (1 + fee)).toFixed(2);
}



function updateInstallments() {
  const installments = parseInt(document.getElementById('installments').value) || 1;
  checkoutState.payment.installments = installments;
  
  const baseTotal = Number(checkoutState.total || 0);
  const fee = INSTALLMENT_FEES[installments] || 0;
  const totalWithFee = baseTotal * (1 + fee);
  
  const valueNoFeeEl = document.getElementById('value-no-fee');
  const valueWithFeeEl = document.getElementById('value-with-fee');
  if (valueNoFeeEl) valueNoFeeEl.textContent = `R$ ${baseTotal.toFixed(2)}`;
  if (valueWithFeeEl) valueWithFeeEl.textContent = `R$ ${totalWithFee.toFixed(2)}`;

  // Atualiza também o summary-total (conforme o pedido)
  const summaryTotalEl = document.getElementById('summary-total');
  if (summaryTotalEl) {
    if (checkoutState.payment.method === 'Credito') {
      summaryTotalEl.textContent = `R$ ${totalWithFee.toFixed(2)}`;
    } else {
      summaryTotalEl.textContent = `R$ ${baseTotal.toFixed(2)}`;
    }
  }

  // Atualiza a revisão
  renderReviewStep();
}

/* ============================================
   CUPOM DE DESCONTO
   ============================================ */
async function applyCoupon() {
  const input = document.getElementById('coupon-input');
  const code = (input?.value || '').trim().toUpperCase();

  if (!code) {
    showToast('Digite um código de cupom', 'error');
    return;
  }

  showLoading('Validando cupom...');

  try {
    // envia para o worker (assume que o worker chamará GAS)
    const res = await fetch(API_CONFIG.WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'validateCoupon',
        payload: { code }
      })
    });

    const data = await res.json();
    console.log('📥 Resposta validação cupom:', data);

    // valida resposta
    if (!data || data.success === false) {
      const reason = (data && (data.error || data.message)) ? (data.error || data.message) : 'Cupom inválido';
      throw new Error(reason);
    }

    // O campo retornado pode estar em várias chaves: desconto, discount, value, desc, etc.
    // Normaliza para string para decidir
    const raw = (data.desconto ?? data.discount ?? data.value ?? data.desc ?? data.type ?? '').toString().trim().toLowerCase();

    // prepara estado do cupom
    checkoutState.coupon = {
      code,
      type: null,
      value: 0,
      discount: 0,
      valid: true
    };

    // CASE: frete grátis (aceita 'frete grátis' ou 'fretegratis' ou 'frete')
    if (raw.includes('frete')) {
      checkoutState.coupon.type = 'fretegratis';
      checkoutState.coupon.value = 0;
      checkoutState.coupon.discount = 0;
      // aplica imediatamente
      checkoutState.delivery.shippingCost = 0;
    }
    // CASE: percentual (ex: "10" ou "10%" ou "10,0")
    else {
      // extrai número (pode vir "10" ou "10%" ou "10,0")
      const numStr = raw.replace('%', '').replace(',', '.').match(/-?\d+(\.\d+)?/);
      if (numStr) {
        const pct = parseFloat(numStr[0]);
        if (!isNaN(pct) && pct > 0) {
          checkoutState.coupon.type = 'percent';
          checkoutState.coupon.value = pct;
          // desconto monetário será calculado em updateTotals()
        } else {
          // sem número válido -> marca como válido, mas sem desconto
          checkoutState.coupon.type = 'unknown';
        }
      } else {
        // fallback: nenhuma informação de desconto, considera válido, sem desconto
        checkoutState.coupon.type = 'unknown';
      }
    }

    // recalcula totais (updateTotals aplica percent -> discount monetário)
    updateTotals();

    // mensagem para o usuário
    const msgEl = document.getElementById('coupon-message');
    if (msgEl) {
      msgEl.className = 'coupon-message success';
      if (checkoutState.coupon.type === 'fretegratis') {
        msgEl.textContent = `✅ Cupom aplicado: frete grátis.`;
      } else if (checkoutState.coupon.type === 'percent') {
        msgEl.textContent = `✅ Cupom aplicado: ${checkoutState.coupon.value}% de desconto.`;
      } else {
        msgEl.textContent = `✅ Cupom aplicado.`;
      }
      msgEl.style.display = 'block';
    }

    showToast('Cupom aplicado!', 'success');

  } catch (error) {
    console.error('Erro ao validar cupom:', error);

    // reset estado do cupom
    checkoutState.coupon = { code: null, discount: 0, valid: false, type: null, value: 0 };

    const msgEl = document.getElementById('coupon-message');
    if (msgEl) {
      msgEl.className = 'coupon-message error';
      msgEl.textContent = `❌ ${error.message || 'Cupom inválido'}`;
      msgEl.style.display = 'block';
    }

    updateTotals();
    showToast(error.message || 'Cupom inválido', 'error');
  } finally {
    hideLoading();
  }
}



/* ============================================
   FINALIZAR PEDIDO
   ============================================ */
async function finishOrder() {
  if (!validateStep4()) return;
  
  // Remover alert de confirmação - chamar diretamente
  
  showLoading('Reservando seus produtos...');
  
  // Desabilitar botão
  const btnText = document.getElementById('btn-finish-text');
  const btnSpinner = document.getElementById('btn-finish-spinner');
  if (btnText) btnText.style.display = 'none';
  if (btnSpinner) btnSpinner.style.display = 'inline-block';
  
  try {
    // Preparar items
    const items = checkoutState.cart.map(item => ({
      id: item.id,
      descricao: item.descricao,
      cores: item.cor || 'Padrão',
      qty: item.quantity
    }));
    
    // Preparar delivery
    let delivery = {
      type: checkoutState.delivery.type
    };
    
    if (checkoutState.delivery.type === 'retirada') {
      // montar endereço com data/hora quando houver
      const dateStr = checkoutState.delivery.pickupDate;
      const timeStr = checkoutState.delivery.pickupTime;
      let pickupText = 'Retirada no local';
      if (dateStr) {
        const [y, m, d] = dateStr.split('-');
        pickupText += ` - ${d}/${m}/${y}`;
      }
      if (timeStr) {
        pickupText += ` às ${timeStr}`;
      }

      // checar troco (se houver)
      let changeRequested = null;
      const changeInput = document.getElementById('change-for');
      if (changeInput) {
        const given = parseCurrency(changeInput.value);
        if (given > 0) {
          const baseTotal = Number(checkoutState.total || 0);
          const diff = Number((given - baseTotal).toFixed(2));
          // diff pode ser zero ou positivo (já validado por validateStep4)
          changeRequested = { given: Number(given.toFixed(2)), change: diff };
          pickupText += ` (Troco para ${given.toFixed(2)} = ${diff.toFixed(2)})`;
        }
      }

      delivery.address = pickupText;
      delivery.cep = API_CONFIG.ORIGIN_ADDRESS.cep;
      delivery.retiradaWho = checkoutState.delivery.pickupWho;
      delivery.retiradaDate = checkoutState.delivery.pickupDate;
      delivery.retiradaTime = checkoutState.delivery.pickupTime;
      delivery.frete = 0;
      delivery.distanceKm = 0;
      if (changeRequested) delivery.changeRequested = changeRequested;
    } else {
      const addr = checkoutState.delivery;
      delivery.address = `${addr.street}, ${addr.number}${addr.complement ? ' - ' + addr.complement : ''}, ${addr.neighborhood}, ${addr.city}/${addr.state}`;
      delivery.cep = addr.cep;
      delivery.distanceKm = addr.distanceKm;
      delivery.frete = addr.shippingCost;
    }
    
    // Preparar payment
     // Preparar payment
    let payment = {
      method: normalizeMethodForWorker(checkoutState.payment.method), // ex: 'credito'|'dinheiro'|'pix'
      methodLabel: checkoutState.payment.method || '', // rótulo legível (para o vendedor)
      installments: Number(checkoutState.payment.installments || 1),
      changeFor: null // número (se informado)
    };

    // se for Dinheiro, preencher changeFor numérico (também manter como string para segurança)
    if ((checkoutState.payment.method || '').toString().toLowerCase() === 'dinheiro') {
      const changeInputEl = document.getElementById('change-for');
      const given = changeInputEl ? parseCurrency(changeInputEl.value) : 0;
      if (given > 0) {
        payment.changeFor = Number(given.toFixed(2)); // número
        payment.changeForRaw = changeInputEl.value;   // string original (opcional, para debug)
        payment.changeRequested = {
          given: Number(given.toFixed(2)),
          change: Number((given - Number(checkoutState.total || 0)).toFixed(2))
        };
      } else {
        // garantir que campo existe (envia vazio em vez de undefined)
        payment.changeFor = '';
        payment.changeForRaw = '';
      }
    } else {
      // para outros métodos, garantir existência das chaves para consistência
      payment.changeFor = '';
      payment.changeForRaw = '';
    }

    
    // Calcular total final (com juros se crédito)
    let finalTotal = Number(checkoutState.total || 0);
    if (checkoutState.payment.method === 'Credito' && checkoutState.payment.installments > 1) {
      const fee = INSTALLMENT_FEES[checkoutState.payment.installments] || 0;
      finalTotal = finalTotal * (1 + fee);
    }
    
    // Montar payload
    const payload = {
  action: 'reserveOrder',
  payload: {
    customer: {
      name: checkoutState.customer.name,
      contact: checkoutState.customer.phone,
    },
    items: items,
    delivery: Object.assign({}, delivery, { type: String(delivery.type || '').toLowerCase() }),
    payment: payment, // já normalizado acima
    coupon: checkoutState.coupon.code || '',
    subtotal: parseFloat(checkoutState.subtotal.toFixed(2)),
    total: parseFloat(finalTotal.toFixed(2))
  }
};

    
    console.log('📤 Enviando pedido:', payload);
    
    // Enviar para Worker
    const response = await fetch(API_CONFIG.WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    console.log('📥 Resposta:', result);
    
    if (result.success) {
      // Consumir cupom se foi usado
      if (checkoutState.coupon.code && checkoutState.coupon.valid) {
        await consumeCoupon(checkoutState.coupon.code);
      }
      
      // Limpar carrinho
      localStorage.removeItem('sublime_cart');
      
      // Salvar ID do pedido
      const orderId = result.orderId || result.orderCode || 'N/A';
      localStorage.setItem('sublime_last_order', orderId);
      
      hideLoading();
      
      // Mostrar popup customizado ao invés de alert
      showSuccessPopup(orderId);
      
    } else {
      throw new Error(result.error || result.message || 'Erro ao processar pedido');
    }
    
  } catch (error) {
    console.error('❌ Erro ao finalizar pedido:', error);
    
    hideLoading();
    if (btnText) btnText.style.display = 'inline';
    if (btnSpinner) btnSpinner.style.display = 'none';
    
    let errorMsg = 'Erro ao processar pedido: ' + error.message;
    
    // Se houver itens indisponíveis
    if (error.itemsUnavailable) {
      errorMsg += '\n\nProdutos sem estoque:\n' + error.itemsUnavailable.join(', ');
    }
    
    alert('❌ ' + errorMsg);
    showToast(error.message || 'Erro ao processar pedido', 'error');
  }
}

/* ============================================
   POPUP DE SUCESSO CUSTOMIZADO
   ============================================ */
function showSuccessPopup(orderId) {
  const paymentMethod = checkoutState.payment.method;
  const deliveryType = checkoutState.delivery.type;
  
  // Formatar data e hora para retirada
  let dateTimeText = '';
  if (deliveryType === 'retirada') {
    const dateStr = checkoutState.delivery.pickupDate;
    const timeStr = checkoutState.delivery.pickupTime;
    if (dateStr) {
      const [year, month, day] = dateStr.split('-');
      dateTimeText = `${timeStr || ''} do dia ${day}/${month}/${year}`;
    }
  }
  
  // Determinar mensagem baseada em pagamento + entrega
  let message = '';
  let showPixButton = false;
  let showWhatsAppButton = false;
  
  // RETIRADA
  if (deliveryType === 'retirada') {
    if (paymentMethod === 'Dinheiro') {
      message = `Pedido <strong>${orderId}</strong> reservado com sucesso!<br><br>Aguardamos você às <strong>${dateTimeText}</strong>.`;
    } else if (paymentMethod === 'PIX') {
      message = `Pedido <strong>${orderId}</strong> reservado com sucesso!<br><br>Aguarde o contato do vendedor caso queira o PIX copia e cola, caso contrário copie a chave abaixo e envie o comprovante pelo WhatsApp do vendedor(a).<br><br>Retirada às <strong>${dateTimeText}</strong>.`;
      showPixButton = true;
    } else if (paymentMethod === 'Credito') {
      message = `Pedido <strong>${orderId}</strong> reservado com sucesso!<br><br>Aguarde o link para pagamento que o vendedor irá te enviar para prosseguir com a retirada, ou se preferir pague quando vir retirar.<br><br>Retirada às <strong>${dateTimeText}</strong>.`;
    }
  }
  // ENTREGA
  else {
    if (paymentMethod === 'Dinheiro') {
      message = `Pedido <strong>${orderId}</strong> reservado com sucesso!<br><br>Agora é só esperar a entrega! O prazo é de até <strong>2 dias</strong> para receber seu pedido.<br><br>Para mais informações clique no botão abaixo para entrar em contato com o vendedor(a):`;
      showWhatsAppButton = true;
    } else if (paymentMethod === 'PIX') {
      message = `Pedido <strong>${orderId}</strong> reservado com sucesso!<br><br>Agora é só esperar a entrega! A aprovação da entrega será realizada assim que o seu PIX for confirmado no nosso sistema, o prazo é de <strong>2 dias</strong>.<br><br>Se quiser adiantar, copie a chave PIX abaixo e envie o comprovante pelo WhatsApp do vendedor:`;
      showPixButton = true;
    } else if (paymentMethod === 'Credito') {
      message = `Pedido <strong>${orderId}</strong> reservado com sucesso!<br><br>Aguarde o contato do vendedor(a), você receberá o link de pagamento on-line, depois disso é só aguardar seu pedido.<br><br>O prazo de entrega é <strong>2 dias</strong> depois da aprovação do pagamento.`;
    }
  }
  
  // Criar popup
  const popup = document.createElement('div');
  popup.id = 'success-popup-overlay';
  popup.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;
  `;
  
  const popupContent = document.createElement('div');
  popupContent.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 30px;
    max-width: 500px;
    width: 100%;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    text-align: center;
    position: relative;
  `;
  
  // SVG do ícone de check (círculo com check)
  const checkIconSVG = ` <img src="../image/verificado.gif" alt="Success" style="width: 80px; height: 80px; margin-bottom: 20px;" /> `;
  
  let buttonsHTML = '';
  
  if (showPixButton) {
    buttonsHTML += `
      <button onclick="copyPixKey()" style="
        background: #ff6fb5;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 16px;
        cursor: pointer;
        margin: 10px 5px;
        transition: background 0.3s;
      " onmouseover="this.style.background='#e55a9f'" onmouseout="this.style.background='#ff6fb5'">
        📋 Copiar chave PIX
      </button>
    `;
  }
  
  if (showWhatsAppButton) {
    const whatsappMsg = encodeURIComponent(`Olá! Queria falar sobre o pedido ${orderId}`);
    const whatsappUrl = `https://wa.me/${API_CONFIG.WHATSAPP_NUMBER}?text=${whatsappMsg}`;
    buttonsHTML += `
      <a href="${whatsappUrl}" target="_blank" style="
        display: inline-block;
        background: #25D366;
        color: white;
        text-decoration: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 16px;
        margin: 10px 5px;
        transition: background 0.3s;
      " onmouseover="this.style.background='#1fb854'" onmouseout="this.style.background='#25D366'">
        💬 Falar com vendedor
      </a>
    `;
  }
  
  popupContent.innerHTML = `
    ${checkIconSVG}
    <div style="font-size: 18px; line-height: 1.6; color: #333; margin-bottom: 20px;">
      ${message}
    </div>
    <div style="margin-top: 20px;">
      ${buttonsHTML}
      <button onclick="closeSuccessPopup()" style="
        background: #6c757d;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 16px;
        cursor: pointer;
        margin: 10px 5px;
        transition: background 0.3s;
      " onmouseover="this.style.background='#5a6268'" onmouseout="this.style.background='#6c757d'">
        Fechar
      </button>
    </div>
  `;
  
  popup.appendChild(popupContent);
  document.body.appendChild(popup);
}

function closeSuccessPopup() {
  const popup = document.getElementById('success-popup-overlay');
  if (popup) {
    popup.remove();
  }
  // Redirecionar para página inicial após fechar
  setTimeout(() => {
    window.location.href = '../index.html';
  }, 3000);
  
}

function copyPixKey() {
  const pixKey = 'c7172483-c032-4694-86cd-eebec564c848';
  
  // Copiar para área de transferência
  navigator.clipboard.writeText(pixKey).then(() => {
    showToast('✅ Chave PIX copiada para a área de transferência!', 'success');
  }).catch(err => {
    // Fallback para navegadores antigos
    const textarea = document.createElement('textarea');
    textarea.value = pixKey;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('✅ Chave PIX copiada para a área de transferência!', 'success');
    } catch (e) {
      showToast('❌ Erro ao copiar chave PIX', 'error');
    }
    document.body.removeChild(textarea);
  });
}

/* ============================================
   CONSUMIR CUPOM
   ============================================ */
// ---------- REPLACE: consumeCoupon (envia ação 'consumeCoupon' ao Worker e trata resposta) ----------
async function consumeCoupon(code) {
  if (!code) return;
  try {
    console.log('🔄 Consumindo cupom:', code);

    const res = await fetch(API_CONFIG.WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'consumeCoupon',
        payload: { code }
      })
    });

    // tenta parsear JSON com segurança
    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error('Resposta inválida do servidor ao consumir cupom');
    }

    if (!data || data.success === false) {
      const reason = (data && (data.error || data.message)) ? (data.error || data.message) : 'Erro ao consumir cupom';
      throw new Error(reason);
    }

    console.log('✅ Cupom consumido:', data);
    return true;
  } catch (error) {
    console.warn('⚠️ Erro ao consumir cupom (não crítico):', error);
    return false;
  }
}

/* ============================================
   TEMA
   ============================================ */
function toggleTheme() {
  document.body.classList.toggle('dark-theme');
  const isDark = document.body.classList.contains('dark-theme');
  localStorage.setItem('sublime_theme', isDark ? 'dark' : 'light');
}

function loadTheme() {
  const theme = localStorage.getItem('sublime_theme');
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
  }
}

/* ============================================
   UI HELPERS
   ============================================ */
function showLoading(text = 'Processando...') {
  const overlay = document.getElementById('loading-overlay');
  const textEl = document.getElementById('loading-text');
  if (overlay) {
    if (textEl) textEl.textContent = text;
    overlay.classList.add('active');
  }
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

const input = document.getElementById("change-for");

  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "");
  });
