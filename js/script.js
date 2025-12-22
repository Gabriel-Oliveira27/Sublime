
const API_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyLj62_6PDu1JAnqkVj9v7lwfyUJ7h_IyaT5eoyUyL4iHT9usGdgH2U9v3SQmDkhvByxA/exec',
  WORKER_URL: 'https://sublime.mcpemaster620.workers.dev/',
  WHATSAPP_NUMBER: '5588988568911'
};

/* ============================================
   ESTADO DA APLICAÇÃO
   ============================================ */
let appState = {
  products: [],
  groupedProducts: [],
  filteredProducts: [],
  cart: [],
  lastUpdate: null,
  currentCarouselSlide: 0,
  carouselInterval: null
};

/* ============================================
   CARROSSEL DE BANNERS
   ============================================ */
const carouselData = [
  {
    title: 'Bem-vindo à Sublime',
    description: 'Produtos Tupperware de qualidade para seu dia a dia',
    image: './imagenscarrossel/homesublime.png', 
    background: 'linear-gradient(135deg, #ff6fb5 0%, #c7aefc 100%)'
  },
  {
    title: 'Ofertas Especiais',
    description: 'Confira nossos produtos com desconto',
    image: './imagenscarrossel/entregasublime.png', // Ajustado para pasta /Imagens/
    background: 'linear-gradient(135deg, #c7aefc 0%, #ff6fb5 100%)'
  },
  {
    title: 'Entrega Rápida',
    description: 'Receba seus produtos com segurança',
    image: './imagenscarrossel/versatsublime.png', // Ajustado para pasta /Imagens/
    background: 'linear-gradient(135deg, #ff6fb5 20%, #0b2340 100%)'
  }
];

function initCarousel() {
  const carouselContainer = document.getElementById('carousel-container');
  if (!carouselContainer) return;
  
  const wrapper = carouselContainer.querySelector('.carousel-wrapper');
  const dotsContainer = carouselContainer.querySelector('.carousel-dots');
  
  // Criar slides
  carouselData.forEach((slide, index) => {
    const slideEl = document.createElement('div');
    slideEl.className = 'carousel-slide';
    slideEl.style.background = slide.background;
    
    // Se houver imagem, usar como background
    if (slide.image) {
      slideEl.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3)), url('${slide.image}')`;
      slideEl.style.backgroundSize = 'cover';
      slideEl.style.backgroundPosition = 'center';
    }
    
    
    wrapper.appendChild(slideEl);
    
    // Criar dot
    const dot = document.createElement('div');
    dot.className = `carousel-dot ${index === 0 ? 'active' : ''}`;
    dot.onclick = () => goToSlide(index);
    dotsContainer.appendChild(dot);
  });
  
  // Iniciar autoplay
  startCarouselAutoplay();
}

function goToSlide(index) {
  const wrapper = document.querySelector('.carousel-wrapper');
  const dots = document.querySelectorAll('.carousel-dot');
  
  appState.currentCarouselSlide = index;
  wrapper.style.transform = `translateX(-${index * 100}%)`;
  
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === index);
  });
}

function nextSlide() {
  const nextIndex = (appState.currentCarouselSlide + 1) % carouselData.length;
  goToSlide(nextIndex);
}

function prevSlide() {
  const prevIndex = (appState.currentCarouselSlide - 1 + carouselData.length) % carouselData.length;
  goToSlide(prevIndex);
}

function startCarouselAutoplay() {
  if (appState.carouselInterval) {
    clearInterval(appState.carouselInterval);
  }
  appState.carouselInterval = setInterval(nextSlide, 5000); // Troca a cada 5 segundos
}

/* ============================================
   CARREGAMENTO DE PRODUTOS
   ============================================ */
async function loadProducts() {
  console.log('📦 Iniciando carregamento de produtos...');
  
  try {
    const response = await fetch(API_CONFIG.GAS_URL);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Produtos carregados:', data);
    
    if (!data.produtos || !Array.isArray(data.produtos)) {
      throw new Error('Formato de dados inválido');
    }
    
    // Filtrar produtos com estoque disponível
    appState.products = data.produtos.filter(p => p.qtd > 0);
    appState.lastUpdate = new Date().toISOString();
    
    // Agrupar produtos por descrição
    groupProducts();
    
    // Aplicar filtros iniciais
    appState.filteredProducts = [...appState.groupedProducts];
    
    // Renderizar produtos
    renderProducts();
    
    // Preencher filtros
    populateFilters();
    
    showToast('Produtos carregados com sucesso!', 'success');
    
  } catch (error) {
    console.error('❌ Erro ao carregar produtos:', error);
    showToast('Erro ao carregar produtos. Tente novamente.', 'error');
    
    document.getElementById('products-container').innerHTML = `
      <div class="loading">
        <p style="color: var(--error);">❌ Erro ao carregar produtos</p>
        <button class="btn-primary" onclick="loadProducts()" style="margin-top: 1rem; padding: 0.75rem 2rem; border-radius: 8px;">
          Tentar Novamente
        </button>
      </div>
    `;
  }
}

/* ============================================
   AGRUPAMENTO DE PRODUTOS
   ============================================ */
function groupProducts() {
  const grouped = {};
  
  appState.products.forEach(product => {
    const key = product.descricao;
    
    if (!grouped[key]) {
      grouped[key] = {
        descricao: product.descricao,
        linha: product.linha,
        litros: product.Litros,
        variations: [],
        minPrice: Infinity,
        maxPrice: 0,
        totalStock: 0
      };
    }
    
    grouped[key].variations.push(product);
    grouped[key].totalStock += product.qtd;
    
    const price = parseFloat(product.valor);
    if (price < grouped[key].minPrice) grouped[key].minPrice = price;
    if (price > grouped[key].maxPrice) grouped[key].maxPrice = price;
  });
  
  appState.groupedProducts = Object.values(grouped);
  console.log('📊 Produtos agrupados:', appState.groupedProducts);
}

/* ============================================
   RENDERIZAÇÃO DE PRODUTOS
   ============================================ */
function renderProducts() {
  const container = document.getElementById('products-container');
  const countEl = document.getElementById('products-count');
  
  if (appState.filteredProducts.length === 0) {
    container.innerHTML = `
      <div class="loading">
        <p>Nenhum produto encontrado</p>
      </div>
    `;
    countEl.textContent = '0 produtos';
    return;
  }
  
  countEl.textContent = `${appState.filteredProducts.length} produtos`;
  
  const productsHTML = appState.filteredProducts.map(group => {
    const hasMultipleVariations = group.variations.length > 1;
    const firstVariation = group.variations[0];
    
    // Caminho correto da imagem: /imagensprodutos/{nome_da_imagem}
    const imagePath = firstVariation.imagem ? `./imagensprodutos/${firstVariation.imagem}` : '';
    
    // Determinar o preço a mostrar
    let priceDisplay;
    if (hasMultipleVariations && group.minPrice !== group.maxPrice) {
      priceDisplay = `<span class="product-price-prefix">A partir de</span> R$ ${group.minPrice.toFixed(2)}`;
    } else {
      priceDisplay = `R$ ${firstVariation.valor.toFixed(2)}`;
    }
    
    // Badges
    let badges = '';
    if (hasMultipleVariations) {
      badges += `<span class="badge badge-options">${group.variations.length} opções</span>`;
    }
    if (group.totalStock <= 5) {
      badges += `<span class="badge badge-last">Últimas unidades</span>`;
    }
    
    return `
      <div class="product-card">
        ${badges ? `<div class="product-badges">${badges}</div>` : ''}
        <img 
          src="${imagePath}" 
          alt="${group.descricao}" 
          class="product-image"
          onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22 viewBox=%220 0 200 200%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22200%22 height=%22200%22/%3E%3Cpath fill=%22%23999%22 d=%22M100 50c-27.6 0-50 22.4-50 50s22.4 50 50 50 50-22.4 50-50-22.4-50-50-50zm0 85c-19.3 0-35-15.7-35-35s15.7-35 35-35 35 15.7 35 35-15.7 35-35 35z%22/%3E%3Ccircle fill=%22%23999%22 cx=%22100%22 cy=%22100%22 r=%2215%22/%3E%3C/svg%3E';"
        />
        <div class="product-name">${group.descricao}</div>
        <div class="product-details">
          ${group.linha ? `<span> ${group.linha}</span>` : ''}
          ${group.litros ? `<span> ${group.litros}</span>` : ''}
        </div>
        <div class="product-price">${priceDisplay}</div>
        <div class="product-stock">${group.totalStock} em estoque</div>
        <button class="product-btn btn-primary" onclick='${hasMultipleVariations ? `openVariationsModal(${JSON.stringify(group).replace(/'/g, "&apos;")})` : `addToCart(${JSON.stringify(firstVariation).replace(/'/g, "&apos;")})`}'>
          ${hasMultipleVariations ? 'Ver Opções' : 'Adicionar ao Carrinho'}
        </button>
      </div>
    `;
  }).join('');
  
  container.innerHTML = `<div class="products-grid">${productsHTML}</div>`;
}

/* ============================================
   MODAL DE VARIAÇÕES
   ============================================ */
function openVariationsModal(group) {
  const modal = document.getElementById('variations-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  
  modalTitle.textContent = group.descricao;
  
  const variationsHTML = group.variations.map(variation => {
    // Caminho correto da imagem: /imagensprodutos/{nome_da_imagem}
    const imagePath = variation.imagem ? `./imagensprodutos/${variation.imagem}` : '';
    
    return `
      <div class="variation-card">
        <img 
          src="${imagePath}" 
          alt="${variation.cor || variation.descricao}" 
          class="variation-image"
          onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22150%22 height=%22150%22 viewBox=%220 0 150 150%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22150%22 height=%22150%22/%3E%3Cpath fill=%22%23999%22 d=%22M75 37c-20.7 0-37.5 16.8-37.5 37.5S54.3 112 75 112s37.5-16.8 37.5-37.5S95.7 37 75 37zm0 63.8c-14.5 0-26.3-11.8-26.3-26.3S60.5 48.2 75 48.2s26.3 11.8 26.3 26.3S89.5 100.8 75 100.8z%22/%3E%3Ccircle fill=%22%23999%22 cx=%2275%22 cy=%2275%22 r=%2211%22/%3E%3C/svg%3E';"
        />
        ${variation.cor ? `
          <div class="variation-color">
            <div class="color-dot" style="background: ${variation.cor.toLowerCase()};"></div>
            <span>${variation.cor}</span>
          </div>
        ` : ''}
        <div class="variation-info">
          ${variation.filtros ? `<div>🏷️ ${variation.filtros}</div>` : ''}
          <div>📦 Estoque: ${variation.qtd}</div>
        </div>
        <div class="variation-price">R$ ${parseFloat(variation.valor).toFixed(2)}</div>
        <button class="product-btn btn-primary" onclick='addToCart(${JSON.stringify(variation).replace(/'/g, "&apos;")}); closeVariationsModal();'>
          Adicionar ao Carrinho
        </button>
      </div>
    `;
  }).join('');
  
  modalBody.innerHTML = `<div class="variations-grid">${variationsHTML}</div>`;
  modal.classList.add('active');
}

function closeVariationsModal() {
  document.getElementById('variations-modal').classList.remove('active');
}

/* ============================================
   CARRINHO DE COMPRAS
   ============================================ */
function loadCart() {
  try {
    const savedCart = localStorage.getItem('sublime_cart');
    if (savedCart) {
      appState.cart = JSON.parse(savedCart);
      updateCartUI();
    }
  } catch (error) {
    console.error('Erro ao carregar carrinho:', error);
  }
}

function saveCart() {
  try {
    localStorage.setItem('sublime_cart', JSON.stringify(appState.cart));
    updateCartUI();
  } catch (error) {
    console.error('Erro ao salvar carrinho:', error);
  }
}

function addToCart(product) {
  const existingItem = appState.cart.find(item => item.id === product.id);
  
  if (existingItem) {
    if (existingItem.quantity < product.qtd) {
      existingItem.quantity += 1;
      showToast('Quantidade atualizada no carrinho', 'success');
    } else {
      showToast('Estoque insuficiente', 'error');
      return;
    }
  } else {
    appState.cart.push({
      ...product,
      quantity: 1
    });
    showToast('Produto adicionado ao carrinho!', 'success');
  }
  
  saveCart();
}

function removeFromCart(productId) {
  appState.cart = appState.cart.filter(
    item => String(item.id) !== String(productId)
  );

  saveCart();
  
  updateCartBadge(); // ← IMPORTANTE
  updateCartTotal(); // ← IMPORTANTE

  showToast('Produto removido do carrinho', 'success');
}


function updateQuantity(productId, delta) {
  const item = appState.cart.find(item => item.id === productId);
  
  if (!item) return;
  
  const newQuantity = item.quantity + delta;
  
  if (newQuantity <= 0) {
    removeFromCart(productId);
    return;
  }
  
  if (newQuantity > item.qtd) {
    showToast('Estoque insuficiente', 'error');
    return;
  }
  
  item.quantity = newQuantity;
  saveCart();
}

function updateCartUI() {
  const cartBadge = document.getElementById('cart-badge');
  const cartItems = document.getElementById('cart-items');
  const cartTotal = document.getElementById('cart-total');
  const checkoutBtn = document.getElementById('checkout-btn');
  
  // Atualizar badge
  const totalItems = appState.cart.reduce((sum, item) => sum + item.quantity, 0);
  cartBadge.textContent = totalItems;
  
  // Atualizar itens do carrinho
  if (appState.cart.length === 0) {
    cartItems.innerHTML = '<div class="cart-empty"><p>Seu carrinho está vazio</p></div>';
    checkoutBtn.disabled = true;
  } else {
    const itemsHTML = appState.cart.map(item => {
      // Usar o mesmo caminho de imagem dos cards: ./imagensprodutos/{nome_da_imagem}
      const imagePath = item.imagem ? `./imagensprodutos/${item.imagem}` : '';
      
      return `
      <div class="cart-item">
        <img 
          src="${imagePath}" 
          alt="${item.descricao}" 
          class="cart-item-image"
          onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22 viewBox=%220 0 80 80%22%3E%3Crect fill=%22%23f0f0f0%22 width=%2280%22 height=%2280%22/%3E%3Cpath fill=%22%23999%22 d=%22M40 20c-11 0-20 9-20 20s9 20 20 20 20-9 20-20-9-20-20-20zm0 34c-7.7 0-14-6.3-14-14s6.3-14 14-14 14 6.3 14 14-6.3 14-14 14z%22/%3E%3Ccircle fill=%22%23999%22 cx=%2240%22 cy=%2240%22 r=%226%22/%3E%3C/svg%3E';"
        />
        <div class="cart-item-details">
          <div class="cart-item-name">${item.descricao}</div>
          ${item.cor ? `<div class="cart-item-color">${item.cor}</div>` : ''}
          <div class="cart-item-price">R$ ${(parseFloat(item.valor) * item.quantity).toFixed(2)}</div>
          <div class="cart-item-qty">
            <button class="qty-btn" onclick="updateQuantity('${item.id}', -1)">-</button>
            <span>${item.quantity}</span>
            <button class="qty-btn" onclick="updateQuantity('${item.id}', 1)">+</button>
          </div>
          <button class="cart-item-remove" onclick="removeFromCart('${item.id}')">Remover</button>
        </div>
      </div>
    `;
    }).join('');
    
    cartItems.innerHTML = itemsHTML;
    checkoutBtn.disabled = false;
  }
  
  // Atualizar total
  const total = appState.cart.reduce((sum, item) => sum + (parseFloat(item.valor) * item.quantity), 0);
  cartTotal.textContent = `R$ ${total.toFixed(2)}`;
}

function toggleCart() {
  const cart = document.getElementById('cart-sidebar');
  const overlay = document.getElementById('overlay');
  
  cart.classList.toggle('active');
  overlay.classList.toggle('active');
}

function goToCheckout() {
  if (appState.cart.length === 0) {
    showToast('Seu carrinho está vazio', 'error');
    return;
  }
  
  window.location.href = 'pages/finalizarpagamento.html';
}

/* ============================================
   FILTROS
   ============================================ */
function populateFilters() {
  const linhaSelect = document.getElementById('filter-linha');
  const litrosSelect = document.getElementById('filter-litros');
  
  // Obter valores únicos
  const linhas = [...new Set(appState.products.map(p => p.linha).filter(Boolean))];
  const litros = [...new Set(appState.products.map(p => p.Litros).filter(Boolean))];
  
  // Preencher select de linhas
  linhas.forEach(linha => {
    const option = document.createElement('option');
    option.value = linha;
    option.textContent = linha;
    linhaSelect.appendChild(option);
  });
  
  // Preencher select de litros
  litros.forEach(litro => {
    const option = document.createElement('option');
    option.value = litro;
    option.textContent = litro;
    litrosSelect.appendChild(option);
  });
}

function applyFilters() {
  const linha = document.getElementById('filter-linha').value.toLowerCase();
  const litros = document.getElementById('filter-litros').value.toLowerCase();
  const search = document.getElementById('filter-search').value.toLowerCase();
  const headerSearch = document.getElementById('header-search').value.toLowerCase();
  
  const searchTerm = search || headerSearch;
  
  appState.filteredProducts = appState.groupedProducts.filter(group => {
    const matchLinha = !linha || group.linha?.toLowerCase().includes(linha);
    const matchLitros = !litros || group.litros?.toLowerCase().includes(litros);
    const matchSearch = !searchTerm || 
      group.descricao?.toLowerCase().includes(searchTerm) ||
      group.variations.some(v => 
        v.cor?.toLowerCase().includes(searchTerm) ||
        v.filtros?.toLowerCase().includes(searchTerm)
      );
    
    return matchLinha && matchLitros && matchSearch;
  });
  
  renderProducts();
}

function clearFilters() {
  document.getElementById('filter-linha').value = '';
  document.getElementById('filter-litros').value = '';
  document.getElementById('filter-search').value = '';
  document.getElementById('header-search').value = '';
  
  appState.filteredProducts = [...appState.groupedProducts];
  renderProducts();
}

/* ============================================
   MENU LATERAL
   ============================================ */
function toggleMenu() {
  const menu = document.getElementById('side-menu');
  const overlay = document.getElementById('overlay');
  
  menu.classList.toggle('active');
  overlay.classList.toggle('active');
}

function closeAll() {
  document.getElementById('cart-sidebar').classList.remove('active');
  document.getElementById('side-menu').classList.remove('active');
  document.getElementById('overlay').classList.remove('active');
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
function openWhatsApp() {
  const message = encodeURIComponent('Olá! Gostaria de mais informações sobre os produtos Sublime.');
  window.open(`https://wa.me/${API_CONFIG.WHATSAPP_NUMBER}?text=${message}`, '_blank');
}

/* ============================================
   TOAST
   ============================================ */
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
   INICIALIZAÇÃO
   ============================================ */
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Inicializando aplicação Sublime...');
  
  // Carregar tema
  loadTheme();
  
  // Carregar carrinho
  loadCart();
  
  // Inicializar carrossel
  initCarousel();
  
  // Carregar produtos
  loadProducts();
  
  // Event listeners
  document.getElementById('header-search')?.addEventListener('input', applyFilters);
  document.getElementById('filter-search')?.addEventListener('input', applyFilters);
  
  // Prevenir fechamento acidental do overlay
  document.getElementById('overlay')?.addEventListener('click', closeAll);
});
