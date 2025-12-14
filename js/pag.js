/* ============================================
   PAG.JS - CHECKOUT SUBLIME
   Sistema de 4 etapas sequenciais
   ============================================ */

/* ============================================
   CONFIGURAÇÕES
   ============================================ */
const API_CONFIG = {
  WORKER_URL: 'https://sublime.mcpemaster620.workers.dev/',
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyLj62_6PDu1JAnqkVj9v7lwfyUJ7h_IyaT5eoyUyL4iHT9usGdgH2U9v3SQmDkhvByxA/exec',
  WHATSAPP_NUMBER: '5588000000000',
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
   ESTADO DO CHECKOUT
   ============================================ */
let checkoutState = {
  currentStep: 1,
  cart: [],
  customer: {
    name: '',
    phone: '',
    cpf: ''
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
    distanceKm: 0,
    shippingCost: 0
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
});

function loadCart() {
  try {
    const savedCart = localStorage.getItem('sublime_cart');
    if (!savedCart || savedCart === '[]') {
      showToast('Carrinho vazio. Redirecionando...', 'error');
      setTimeout(() => window.location.href = 'index.html', 2000);
      return;
    }
    
    checkoutState.cart = JSON.parse(savedCart);
    updateSubtotal();
    renderSummaryItems();
  } catch (error) {
    console.error('Erro ao carregar carrinho:', error);
    showToast('Erro ao carregar carrinho', 'error');
    setTimeout(() => window.location.href = 'index.html', 2000);
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
  const subtotal = checkoutState.subtotal;
  const shipping = checkoutState.delivery.shippingCost || 0;
  const discount = checkoutState.coupon.discount || 0;
  const total = subtotal + shipping - discount;
  
  checkoutState.total = total;
  
  // Atualizar resumo lateral
  document.getElementById('summary-subtotal').textContent = `R$ ${subtotal.toFixed(2)}`;
  document.getElementById('summary-shipping').textContent = shipping > 0 ? `R$ ${shipping.toFixed(2)}` : (checkoutState.delivery.type === 'retirada' ? 'Grátis' : 'Calcular');
  document.getElementById('summary-discount').textContent = discount > 0 ? `-R$ ${discount.toFixed(2)}` : 'R$ 0,00';
  document.getElementById('summary-total').textContent = `R$ ${total.toFixed(2)}`;
}

/* ============================================
   MÁSCARAS DE INPUT
   ============================================ */
function initMasks() {
  const phoneInput = document.getElementById('customer-phone');
  const cpfInput = document.getElementById('customer-cpf');
  const cepInputs = [document.getElementById('delivery-cep')];
  
  if (phoneInput) phoneInput.addEventListener('input', (e) => maskPhone(e.target));
  if (cpfInput) cpfInput.addEventListener('input', (e) => maskCPF(e.target));
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

function maskCPF(input) {
  let value = input.value.replace(/\D/g, '');
  value = value.replace(/(\d{3})(\d)/, '$1.$2');
  value = value.replace(/(\d{3})(\d)/, '$1.$2');
  value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  input.value = value.substr(0, 14);
}

function maskCEP(input) {
  let value = input.value.replace(/\D/g, '');
  value = value.replace(/^(\d{5})(\d)/, '$1-$2');
  input.value = value.substr(0, 9);
}

/* ============================================
   VALIDAÇÃO DE CPF (ALGORITMO OFICIAL)
   ============================================ */
function validateCPF(cpf) {
  cpf = cpf.replace(/\D/g, '');
  
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // CPF com todos dígitos iguais
  
  // Validar primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let digit1 = 11 - (sum % 11);
  if (digit1 >= 10) digit1 = 0;
  
  if (parseInt(cpf.charAt(9)) !== digit1) return false;
  
  // Validar segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  let digit2 = 11 - (sum % 11);
  if (digit2 >= 10) digit2 = 0;
  
  if (parseInt(cpf.charAt(10)) !== digit2) return false;
  
  return true;
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
    renderReviewStep();
  } else if (stepNumber === 4) {
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
  const cpf = document.getElementById('customer-cpf').value.trim();
  
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
  
  if (!cpf) {
    showError('error-cpf', 'Digite seu CPF');
    document.getElementById('customer-cpf').focus();
    return false;
  }
  
  if (!validateCPF(cpf)) {
    showError('error-cpf', 'CPF inválido. Verifique os dígitos');
    document.getElementById('customer-cpf').focus();
    showToast('CPF inválido', 'error');
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
    
    if (checkoutState.delivery.shippingCost === 0 && checkoutState.subtotal > 99 && checkoutState.subtotal <= 350) {
      showToast('Calcule o frete antes de continuar', 'error');
      return false;
    }
    
    return true;
  }
}

// Etapa 4: Pagamento
function validateStep4() {
  if (!checkoutState.payment.method) {
    showToast('Selecione uma forma de pagamento', 'error');
    return false;
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
    checkoutState.customer.cpf = document.getElementById('customer-cpf').value.trim();
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
  const cep = cepInput.value.replace(/\D/g, '');
  
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
    
    showToast('CEP encontrado!', 'success');
    
  } catch (error) {
    console.error('Erro ao buscar CEP:', error);
    showToast('CEP não encontrado', 'error');
  } finally {
    hideLoading();
  }
}

/* ============================================
   GEOCODING (NOMINATIM - OpenStreetMap)
   ============================================ */
async function geocodeOrigin() {
  try {
    const address = `${API_CONFIG.ORIGIN_ADDRESS.street}, ${API_CONFIG.ORIGIN_ADDRESS.city}, ${API_CONFIG.ORIGIN_ADDRESS.state}, ${API_CONFIG.ORIGIN_ADDRESS.cep}`;
    const coords = await geocodeAddress(address);
    
    if (coords) {
      API_CONFIG.ORIGIN_ADDRESS.lat = coords.lat;
      API_CONFIG.ORIGIN_ADDRESS.lon = coords.lon;
      console.log('✅ Origem geocodificada:', coords);
    }
  } catch (error) {
    console.warn('⚠️ Erro ao geocodificar origem:', error);
  }
}

async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Sublime E-commerce'
      }
    });
    
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
  const city = document.getElementById('delivery-city').value.trim();
  if (!city) {
    showToast('Informe a cidade', 'error');
    return;
  }

  let cost = 0;

  if (checkoutState.subtotal <= 99) {
    cost = 0;
  } else if (checkoutState.subtotal > 350) {
    cost = 10;
  } else {
    const originCity = API_CONFIG.ORIGIN_ADDRESS.city.toLowerCase();
    const destCity = city.toLowerCase();

    if (originCity !== destCity) {
      cost = 15;
    } else {
      cost = 7; // valor médio local
    }
  }

  checkoutState.delivery.shippingCost = cost;
  checkoutState.delivery.distanceKm = 0;

  document.getElementById('shipping-result').style.display = 'block';
  document.getElementById('shipping-value').textContent = cost.toFixed(2);

  updateTotals();
  showToast('Frete calculado!', 'success');
}

/* ============================================
   HAVERSINE (Distância geodésica)
   ============================================ */
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
  let cost = 0;
  let note = '';
  
  // REGRA 1: Subtotal <= 99 → GRÁTIS
  if (subtotal <= 99) {
    cost = 0;
    note = '🎉 Frete grátis para compras até R$ 99,00!';
  }
  // REGRA 2: Subtotal > 350 → R$ 10,00
  else if (subtotal > 350) {
    cost = 10.00;
    note = '✨ Frete fixo de R$ 10,00 para compras acima de R$ 350,00!';
  }
  // REGRA 3: Calcular por distância
  else {
    // Verificar se é outra cidade
    const originCity = API_CONFIG.ORIGIN_ADDRESS.city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const destCity = city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    if (originCity !== destCity) {
      cost = 15.00;
      note = '⚠️ Entrega para outra cidade. Pode sofrer variação conforme localidade. Consulte a atendente se necessário.';
    } else {
      // Faixas de distância
      if (distanceKm < 2.0) {
        cost = 0.00;
      } else if (distanceKm < 4.0) {
        cost = 3.50;
      } else if (distanceKm <= 6.0) {
        cost = 7.00;
      } else if (distanceKm < 10.0) {
        cost = 10.00;
      } else {
        cost = 15.00;
        note = '⚠️ Distância superior a 10 km. Pode sofrer variação. Consulte a atendente se necessário.';
      }
    }
  }
  
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
  document.getElementById('review-items').innerHTML = itemsHTML;
  
  // Recebimento
  let deliveryHTML = '';
  if (checkoutState.delivery.type === 'retirada') {
    deliveryHTML = `
      <p><strong>Tipo:</strong> Retirada no local</p>
      <p><strong>Quem vai retirar:</strong> ${checkoutState.delivery.pickupWho}</p>
      <p><strong>Data:</strong> ${formatDate(checkoutState.delivery.pickupDate)}</p>
      <p><strong>Horário:</strong> ${checkoutState.delivery.pickupTime}</p>
      <p class="small-text">📍 ${API_CONFIG.ORIGIN_ADDRESS.street}, ${API_CONFIG.ORIGIN_ADDRESS.neighborhood}</p>
    `;
  } else {
    deliveryHTML = `
      <p><strong>Tipo:</strong> Entrega</p>
      <p><strong>Endereço:</strong> ${checkoutState.delivery.street}, ${checkoutState.delivery.number}</p>
      ${checkoutState.delivery.complement ? `<p><strong>Complemento:</strong> ${checkoutState.delivery.complement}</p>` : ''}
      <p>${checkoutState.delivery.neighborhood}, ${checkoutState.delivery.city}/${checkoutState.delivery.state}</p>
      <p><strong>CEP:</strong> ${checkoutState.delivery.cep}</p>
      <p><strong>Distância:</strong> ${checkoutState.delivery.distanceKm.toFixed(1)} km</p>
      <p><strong>Frete:</strong> R$ ${checkoutState.delivery.shippingCost.toFixed(2)}</p>
    `;
  }
  document.getElementById('review-delivery').innerHTML = deliveryHTML;
  
  // Valores
  const shipping = checkoutState.delivery.shippingCost || 0;
  const discount = checkoutState.coupon.discount || 0;
  const total = checkoutState.subtotal + shipping - discount;
  
  document.getElementById('review-subtotal').textContent = `R$ ${checkoutState.subtotal.toFixed(2)}`;
  document.getElementById('review-shipping').textContent = `R$ ${shipping.toFixed(2)}`;
  document.getElementById('review-discount').textContent = discount > 0 ? `-R$ ${discount.toFixed(2)}` : 'R$ 0,00';
  document.getElementById('review-total').textContent = `R$ ${total.toFixed(2)}`;
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
  }
}

function updateInstallmentOptions() {
  const select = document.getElementById('installments');
  if (!select) return;
  
  const baseTotal = checkoutState.total;
  
  for (let i = 1; i <= 12; i++) {
    const fee = INSTALLMENT_FEES[i];
    const totalWithFee = baseTotal * (1 + fee);
    const installmentValue = totalWithFee / i;
    
    const option = select.options[i - 1];
    if (option) {
      option.textContent = i === 1 
        ? `1x sem juros - R$ ${baseTotal.toFixed(2)}`
        : `${i}x de R$ ${installmentValue.toFixed(2)}`;
      option.value = i;
    }
  }
  
  updateInstallments();
}

function updateInstallments() {
  const installments = parseInt(document.getElementById('installments').value) || 1;
  checkoutState.payment.installments = installments;
  
  const baseTotal = checkoutState.total;
  const fee = INSTALLMENT_FEES[installments];
  const totalWithFee = baseTotal * (1 + fee);
  
  document.getElementById('value-no-fee').textContent = `R$ ${baseTotal.toFixed(2)}`;
  document.getElementById('value-with-fee').textContent = `R$ ${totalWithFee.toFixed(2)}`;
}

/* ============================================
   CUPOM DE DESCONTO
   ============================================ */
async function applyCoupon() {
  const input = document.getElementById('coupon-input');
  const code = input.value.trim().toUpperCase();
  
  if (!code) {
    showToast('Digite um código de cupom', 'error');
    return;
  }
  
  showLoading('Validando cupom...');
  
  try {
    const response = await fetch(API_CONFIG.WORKER_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'validateCoupon',
    payload: { code }
  })
});
    
    const data = await response.json();
    
    if (data.success && data.valid) {
      checkoutState.coupon.code = code;
      checkoutState.coupon.discount = data.discount || 0;
      checkoutState.coupon.valid = true;
      
      updateTotals();
      
      const msgEl = document.getElementById('coupon-message');
      msgEl.className = 'coupon-message success';
      msgEl.textContent = `✅ Cupom aplicado! Desconto de R$ ${data.discount.toFixed(2)}`;
      msgEl.style.display = 'block';
      
      showToast('Cupom aplicado!', 'success');
    } else {
      throw new Error(data.message || 'Cupom inválido');
    }
    
  } catch (error) {
    console.error('Erro ao validar cupom:', error);
    
    checkoutState.coupon.code = null;
    checkoutState.coupon.discount = 0;
    checkoutState.coupon.valid = false;
    
    const msgEl = document.getElementById('coupon-message');
    msgEl.className = 'coupon-message error';
    msgEl.textContent = `❌ ${error.message || 'Cupom inválido'}`;
    msgEl.style.display = 'block';
    
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
  
  // Confirmar com usuário
  if (!confirm('Confirma a reserva do pedido?')) {
    return;
  }
  
  showLoading('Reservando seus produtos...');
  
  // Desabilitar botão
  const btnText = document.getElementById('btn-finish-text');
  const btnSpinner = document.getElementById('btn-finish-spinner');
  btnText.style.display = 'none';
  btnSpinner.style.display = 'inline-block';
  
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
      delivery.address = 'Retirada no local';
      delivery.cep = API_CONFIG.ORIGIN_ADDRESS.cep;
      delivery.retiradaWho = checkoutState.delivery.pickupWho;
      delivery.retiradaDate = checkoutState.delivery.pickupDate;
      delivery.retiradaTime = checkoutState.delivery.pickupTime;
      delivery.frete = 0;
      delivery.distanceKm = 0;
    } else {
      const addr = checkoutState.delivery;
      delivery.address = `${addr.street}, ${addr.number}${addr.complement ? ' - ' + addr.complement : ''}, ${addr.neighborhood}, ${addr.city}/${addr.state}`;
      delivery.cep = addr.cep;
      delivery.distanceKm = addr.distanceKm;
      delivery.frete = addr.shippingCost;
    }
    
    // Preparar payment
    const payment = {
      method: checkoutState.payment.method,
      installments: checkoutState.payment.installments
    };
    
    if (checkoutState.payment.method === 'Dinheiro') {
      payment.changeFor = document.getElementById('change-for')?.value || '';
    }
    
    // Calcular total final (com juros se crédito)
    let finalTotal = checkoutState.total;
    if (checkoutState.payment.method === 'Credito' && checkoutState.payment.installments > 1) {
      const fee = INSTALLMENT_FEES[checkoutState.payment.installments];
      finalTotal = checkoutState.total * (1 + fee);
    }
    
    // Montar payload
    const payload = {
      action: 'reserveOrder',
      payload: {
        customer: {
          name: checkoutState.customer.name,
          contact: checkoutState.customer.phone,
          cpf: checkoutState.customer.cpf
        },
        items: items,
        delivery: delivery,
        payment: payment,
        coupon: checkoutState.coupon.code,
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
      
      alert(`✅ Pedido reservado com sucesso!\n\n📦 Código de rastreio: ${orderId}\n\nAnote este código para acompanhar seu pedido.`);
      
      // Redirecionar
      window.location.href = `checharpedido.html?order=${orderId}`;
      
    } else {
      throw new Error(result.error || result.message || 'Erro ao processar pedido');
    }
    
  } catch (error) {
    console.error('❌ Erro ao finalizar pedido:', error);
    
    hideLoading();
    btnText.style.display = 'inline';
    btnSpinner.style.display = 'none';
    
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
   CONSUMIR CUPOM
   ============================================ */
async function consumeCoupon(code) {
  try {
    console.log('🔄 Consumindo cupom:', code);
    
    await fetch(API_CONFIG.WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
  action: 'consumeCoupon',
  payload: { code }
})
    });
    
    console.log('✅ Cupom consumido');
  } catch (error) {
    console.warn('⚠️ Erro ao consumir cupom (não crítico):', error);
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
