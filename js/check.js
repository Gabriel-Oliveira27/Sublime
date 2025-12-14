/* ============================================
   CHECK.JS - CHECHARPEDIDO.HTML
   ============================================ */

/* ============================================
   CONFIGURAÇÕES
   ============================================ */
const API_CONFIG = {
  WORKER_URL: 'https://sublime.mcpemaster620.workers.dev/',
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyLj62_6PDu1JAnqkVj9v7lwfyUJ7h_IyaT5eoyUyL4iHT9usGdgH2U9v3SQmDkhvByxA/exec',
  WHATSAPP_NUMBER: '5588000000000'
};

/* ============================================
   ESTADO
   ============================================ */
let orderState = {
  currentOrder: null,
  isLoading: false
};

/* ============================================
   BUSCAR PEDIDO
   ============================================ */
async function searchOrder() {
  const orderIdInput = document.getElementById('order-id-input');
  const orderId = orderIdInput.value.trim();
  
  if (!orderId) {
    showToast('Digite o ID do pedido', 'error');
    return;
  }
  
  // Desabilitar botão
  const searchBtn = document.getElementById('search-btn');
  searchBtn.disabled = true;
  searchBtn.textContent = 'Buscando...';
  
  showLoading(true);
  hideError();
  hideOrderResult();
  
  try {
    console.log('🔍 Buscando pedido:', orderId);
    
    // Fazer POST para o Worker
    const response = await fetch(API_CONFIG.WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'getOrder',
        orderId: orderId
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('📥 Resposta recebida:', data);
    
    if (data.success && data.order) {
      orderState.currentOrder = data.order;
      displayOrder(data.order);
      showToast('Pedido encontrado!', 'success');
    } else {
      throw new Error(data.message || 'Pedido não encontrado');
    }
    
  } catch (error) {
    console.error('❌ Erro ao buscar pedido:', error);
    showError('Pedido não encontrado. Verifique o ID e tente novamente.');
    showToast('Erro ao buscar pedido', 'error');
  } finally {
    showLoading(false);
    searchBtn.disabled = false;
    searchBtn.textContent = 'Buscar Pedido';
  }
}

/* ============================================
   EXIBIR PEDIDO
   ============================================ */
function displayOrder(order) {
  const resultDiv = document.getElementById('order-result');
  
  // Atualizar cabeçalho
  document.getElementById('order-header-id').textContent = order.id || order.orderId;
  
  // Atualizar status
  updateOrderStatus(order.status);
  
  // Atualizar timeline
  updateTimeline(order.timeline || []);
  
  // Atualizar detalhes
  updateOrderDetails(order);
  
  // Atualizar itens
  updateOrderItems(order.items || []);
  
  // Mostrar resultado
  resultDiv.classList.add('active');
  
  // Scroll suave para o resultado
  setTimeout(() => {
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 300);
}

/* ============================================
   ATUALIZAR STATUS
   ============================================ */
function updateOrderStatus(status) {
  const statusDiv = document.getElementById('order-status');
  const statusIcon = document.getElementById('status-icon');
  const statusTitle = document.getElementById('status-title');
  const statusDescription = document.getElementById('status-description');
  
  // Remover classes antigas
  statusDiv.className = 'order-status';
  
  // Definir informações baseadas no status
  const statusInfo = getStatusInfo(status);
  
  statusDiv.classList.add(statusInfo.class);
  statusIcon.innerHTML = statusInfo.icon;
  statusTitle.textContent = statusInfo.title;
  statusDescription.textContent = statusInfo.description;
}

function getStatusInfo(status) {
  const statusMap = {
    'pending': {
      class: 'pending',
      icon: '<svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>',
      title: 'Pedido Pendente',
      description: 'Seu pedido está sendo processado'
    },
    'confirmed': {
      class: 'confirmed',
      icon: '<svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
      title: 'Pedido Confirmado',
      description: 'Seu pedido foi confirmado e está sendo preparado'
    },
    'shipped': {
      class: 'shipped',
      icon: '<svg fill="currentColor" viewBox="0 0 24 24"><path d="M18 18.5a1.5 1.5 0 0 1-1.5-1.5 1.5 1.5 0 0 1 1.5-1.5 1.5 1.5 0 0 1 1.5 1.5 1.5 1.5 0 0 1-1.5 1.5m1.5-9l1.96 2.5H17V9.5m-11 9A1.5 1.5 0 0 1 4.5 17 1.5 1.5 0 0 1 6 15.5 1.5 1.5 0 0 1 7.5 17 1.5 1.5 0 0 1 6 18.5M20 8h-3V4H3c-1.11 0-2 .89-2 2v11h2a3 3 0 0 0 3 3 3 3 0 0 0 3-3h6a3 3 0 0 0 3 3 3 3 0 0 0 3-3h2v-5l-3-4z"/></svg>',
      title: 'Pedido Enviado',
      description: 'Seu pedido está a caminho'
    },
    'delivered': {
      class: 'delivered',
      icon: '<svg fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>',
      title: 'Pedido Entregue',
      description: 'Seu pedido foi entregue com sucesso!'
    },
    'cancelled': {
      class: 'cancelled',
      icon: '<svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>',
      title: 'Pedido Cancelado',
      description: 'Este pedido foi cancelado'
    }
  };
  
  return statusMap[status] || statusMap['pending'];
}

/* ============================================
   ATUALIZAR TIMELINE
   ============================================ */
function updateTimeline(timeline) {
  const timelineDiv = document.getElementById('order-timeline-items');
  
  if (!timeline || timeline.length === 0) {
    timelineDiv.innerHTML = '<p style="color: var(--text-secondary);">Nenhuma atualização disponível</p>';
    return;
  }
  
  const timelineHTML = timeline.map((item, index) => {
    const isActive = index === timeline.length - 1;
    const isCompleted = index < timeline.length - 1;
    
    return `
      <div class="timeline-item ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}">
        <div class="timeline-content">
          <h4>${item.title || item.status}</h4>
          <p>${item.description || ''}</p>
          ${item.date ? `<div class="timeline-date">${formatDate(item.date)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
  
  timelineDiv.innerHTML = timelineHTML;
}

/* ============================================
   ATUALIZAR DETALHES
   ============================================ */
function updateOrderDetails(order) {
  const detailsDiv = document.getElementById('order-details-content');
  
  const customer = order.customer || {};
  const delivery = order.delivery || {};
  const payment = order.payment || {};
  const totals = order.totals || {};
  
  const detailsHTML = `
    <div class="detail-row">
      <span class="detail-label">Nome:</span>
      <span class="detail-value">${customer.name || 'N/A'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Email:</span>
      <span class="detail-value">${customer.email || 'N/A'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Telefone:</span>
      <span class="detail-value">${customer.phone || 'N/A'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Tipo de Entrega:</span>
      <span class="detail-value">${delivery.type === 'entrega' ? 'Entrega' : 'Retirada'}</span>
    </div>
    ${delivery.type === 'entrega' && delivery.address ? `
      <div class="detail-row">
        <span class="detail-label">Endereço:</span>
        <span class="detail-value">
          ${delivery.address.street}, ${delivery.address.number}${delivery.address.complement ? ' - ' + delivery.address.complement : ''}<br>
          ${delivery.address.neighborhood} - ${delivery.address.city}/${delivery.address.state}<br>
          CEP: ${delivery.address.cep}
        </span>
      </div>
    ` : ''}
    <div class="detail-row">
      <span class="detail-label">Método de Pagamento:</span>
      <span class="detail-value">${formatPaymentMethod(payment.method)}</span>
    </div>
    ${payment.installments > 1 ? `
      <div class="detail-row">
        <span class="detail-label">Parcelamento:</span>
        <span class="detail-value">${payment.installments}x</span>
      </div>
    ` : ''}
    <div class="detail-row">
      <span class="detail-label">Subtotal:</span>
      <span class="detail-value">R$ ${(totals.subtotal || 0).toFixed(2)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Frete:</span>
      <span class="detail-value">R$ ${(totals.shipping || 0).toFixed(2)}</span>
    </div>
    ${totals.discount > 0 ? `
      <div class="detail-row">
        <span class="detail-label">Desconto:</span>
        <span class="detail-value" style="color: var(--success);">-R$ ${totals.discount.toFixed(2)}</span>
      </div>
    ` : ''}
    <div class="detail-row" style="border-top: 2px solid var(--border); padding-top: 1rem; margin-top: 0.5rem;">
      <span class="detail-label" style="font-size: 1.1rem; font-weight: 700;">Total:</span>
      <span class="detail-value" style="font-size: 1.3rem; font-weight: 700; color: var(--accent);">R$ ${(totals.total || 0).toFixed(2)}</span>
    </div>
  `;
  
  detailsDiv.innerHTML = detailsHTML;
}

/* ============================================
   ATUALIZAR ITENS
   ============================================ */
function updateOrderItems(items) {
  const itemsDiv = document.getElementById('order-items-content');
  
  if (!items || items.length === 0) {
    itemsDiv.innerHTML = '<p style="color: var(--text-secondary);">Nenhum item encontrado</p>';
    return;
  }
  
  const itemsHTML = items.map(item => `
    <div class="order-item">
      <img 
        src="${item.imagem || 'https://via.placeholder.com/80x80?text=Sem+Imagem'}" 
        alt="${item.descricao}" 
        class="order-item-image"
        onerror="this.src='https://via.placeholder.com/80x80?text=Sem+Imagem'"
      />
      <div class="order-item-details">
        <h4>${item.descricao}</h4>
        ${item.cor ? `<p>Cor: ${item.cor}</p>` : ''}
        <p>Quantidade: ${item.quantidade || item.quantity}</p>
        <p class="order-item-price">
          R$ ${(item.valorUnitario || item.valor || 0).toFixed(2)} x ${item.quantidade || item.quantity} = 
          R$ ${(item.valorTotal || ((item.valorUnitario || item.valor || 0) * (item.quantidade || item.quantity))).toFixed(2)}
        </p>
      </div>
    </div>
  `).join('');
  
  itemsDiv.innerHTML = itemsHTML;
}

/* ============================================
   HELPERS
   ============================================ */
function formatPaymentMethod(method) {
  const methods = {
    'pix': 'PIX',
    'dinheiro': 'Dinheiro',
    'cartao': 'Cartão de Crédito'
  };
  
  return methods[method] || method || 'N/A';
}

function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return dateString;
  }
}

/* ============================================
   UI HELPERS
   ============================================ */
function showLoading(show) {
  const loadingDiv = document.getElementById('loading');
  if (loadingDiv) {
    loadingDiv.style.display = show ? 'block' : 'none';
  }
}

function showError(message) {
  const errorDiv = document.getElementById('error-message');
  const errorText = document.getElementById('error-text');
  
  if (errorDiv && errorText) {
    errorText.textContent = message;
    errorDiv.classList.add('active');
  }
}

function hideError() {
  const errorDiv = document.getElementById('error-message');
  if (errorDiv) {
    errorDiv.classList.remove('active');
  }
}

function showOrderResult() {
  const resultDiv = document.getElementById('order-result');
  if (resultDiv) {
    resultDiv.classList.add('active');
  }
}

function hideOrderResult() {
  const resultDiv = document.getElementById('order-result');
  if (resultDiv) {
    resultDiv.classList.remove('active');
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
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
  const savedTheme = localStorage.getItem('sublime_theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
  }
}

/* ============================================
   WHATSAPP
   ============================================ */
function contactSupport() {
  const orderId = orderState.currentOrder?.id || orderState.currentOrder?.orderId || '';
  const message = encodeURIComponent(`Olá! Gostaria de falar sobre o pedido #${orderId}`);
  window.open(`https://wa.me/${API_CONFIG.WHATSAPP_NUMBER}?text=${message}`, '_blank');
}

/* ============================================
   INICIALIZAÇÃO
   ============================================ */
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Inicializando página de checar pedido...');
  
  // Carregar tema
  loadTheme();
  
  // Verificar se há ID do pedido na URL
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('order');
  
  if (orderId) {
    document.getElementById('order-id-input').value = orderId;
    searchOrder();
  }
  
  // Verificar se há último pedido salvo
  const lastOrder = localStorage.getItem('sublime_last_order');
  if (lastOrder && !orderId) {
    document.getElementById('order-id-input').value = lastOrder;
  }
  
  // Event listener para Enter no input
  document.getElementById('order-id-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      searchOrder();
    }
  });
});
