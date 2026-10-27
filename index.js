require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const qrcode = require('qrcode');
const crypto = require('crypto');
const adminRouter = require('./admin');

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());
app.use(cors({ origin: process.env.SITE_URL, credentials: true }));
app.use(helmet({ contentSecurityPolicy: false })); // Disabled strict CSP to allow integrated frontend scripts

// Rate Limiting
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: "Too many requests, please try again later." });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: "Too many login attempts." });
app.use('/api/', apiLimiter);

// --- MongoDB Serverless Connection ---
let cached = global.mongoose;
if (!cached) { cached = global.mongoose = { conn: null, promise: null }; }

async function connectDB() {
    if (cached.conn) return cached.conn;
    if (!cached.promise) {
        mongoose.set('strictQuery', true);
        cached.promise = mongoose.connect(process.env.MONGODB_URI, {
            dbName: process.env.MONGODB_DB || 'jeevika_nursery',
            maxPoolSize: 10
        }).then(m => m);
    }
    cached.conn = await cached.promise;
    return cached.conn;
}

// --- Mongoose Schemas & Models ---
const plantSchema = new mongoose.Schema({
    slug: { type: String, unique: true, required: true },
    nameHi: { type: String, required: true },
    nameEn: { type: String, required: true },
    description: String,
    category: String,
    price: { type: Number, default: null },
    isAvailable: { type: Boolean, default: true },
    imageUrl: { type: String, default: "" },
    isPublished: { type: Boolean, default: true }
}, { timestamps: true });

const trainingSchema = new mongoose.Schema({
    slug: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    description: String,
    duration: String,
    eligibility: String,
    isPublished: { type: Boolean, default: true }
}, { timestamps: true });

const enquirySchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true },
    category: { type: String, required: true },
    email: String,
    message: String,
    status: { type: String, default: 'New' } // New, Contacted, In Progress, Resolved, Spam
}, { timestamps: true });

const certificateSchema = new mongoose.Schema({
    certId: { type: String, unique: true, required: true },
    recipientName: { type: String, required: true },
    programName: { type: String, required: true },
    issueDate: { type: Date, default: Date.now },
    status: { type: String, default: 'Valid' } // Valid, Revoked
}, { timestamps: true });

const gallerySchema = new mongoose.Schema({
    imageUrl: { type: String, required: true },
    category: String,
    caption: String,
    isPublished: { type: Boolean, default: true }
}, { timestamps: true });

const adminSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true }
}, { timestamps: true });

const models = {
    Plant: mongoose.models.Plant || mongoose.model('Plant', plantSchema),
    Training: mongoose.models.Training || mongoose.model('Training', trainingSchema),
    Enquiry: mongoose.models.Enquiry || mongoose.model('Enquiry', enquirySchema),
    Certificate: mongoose.models.Certificate || mongoose.model('Certificate', certificateSchema),
    Gallery: mongoose.models.Gallery || mongoose.model('Gallery', gallerySchema),
    Admin: mongoose.models.Admin || mongoose.model('Admin', adminSchema)
};

// --- Initialization / Seed Logic ---
const seedData = async () => {
    try {
        const count = await models.Plant.countDocuments();
        if (count > 0) return; // Prevent overwriting

        const initialPlants = [
            { slug: 'mahogany', nameHi: 'महोगनी', nameEn: 'Mahogany', category: 'काष्ठीय वृक्ष', description: 'मूल्यवान काष्ठीय वृक्ष' },
            { slug: 'arjun', nameHi: 'अर्जुन', nameEn: 'Arjun Tree', category: 'औषधीय', description: 'पारंपरिक रूप से औषधीय उपयोग वाला वृक्ष' },
            { slug: 'jamun', nameHi: 'जामुन', nameEn: 'Jamun / Java Plum', category: 'फलदार वृक्ष', description: 'स्वादिष्ट फलदार वृक्ष' },
            { slug: 'kadam', nameHi: 'कदम', nameEn: 'Kadam Tree', category: 'सजावटी', description: 'सुंदर फूलों वाला वृक्ष' },
            { slug: 'guava', nameHi: 'अमरूद', nameEn: 'Guava', category: 'फलदार वृक्ष', description: 'लोकप्रिय फलदार पौधा' },
            { slug: 'eucalyptus', nameHi: 'सफेदा', nameEn: 'Eucalyptus', category: 'औद्योगिक', description: 'औद्योगिक उपयोग वाला वृक्ष' },
            { slug: 'teak', nameHi: 'सागवान', nameEn: 'Teak', category: 'काष्ठीय वृक्ष', description: 'मूल्यवान काष्ठीय वृक्ष' },
            { slug: 'poplar', nameHi: 'पोपलर', nameEn: 'Poplar', category: 'काष्ठीय वृक्ष', description: 'काष्ठ एवं औद्योगिक उपयोग वाला वृक्ष' },
            { slug: 'amla', nameHi: 'आंवला', nameEn: 'Amla / Indian Gooseberry', category: 'फलदार वृक्ष', description: 'पोषक फल वाला पौधा' },
            { slug: 'ashok', nameHi: 'अशोक', nameEn: 'Ashok Tree', category: 'सजावटी', description: 'सजावटी एवं पारंपरिक महत्व वाला वृक्ष' },
            { slug: 'casuarina', nameHi: 'लम्बू', nameEn: 'Casuarina / Tall Tree', category: 'काष्ठीय वृक्ष', description: 'स्थानीय नाम (प्रजाति की पुष्टि आवश्यक)' },
            { slug: 'neem', nameHi: 'नीम', nameEn: 'Neem', category: 'औषधीय', description: 'पारंपरिक उपयोग वाला वृक्ष' },
            { slug: 'mahua', nameHi: 'महुआ', nameEn: 'Mahua', category: 'पारंपरिक', description: 'फूलों एवं अन्य उपयोगों वाला वृक्ष' },
            { slug: 'rose', nameHi: 'गुलाब', nameEn: 'Rose', category: 'सजावटी', description: 'सजावटी फूलों वाला पौधा' },
            { slug: 'champa', nameHi: 'चम्पा', nameEn: 'Champa / Plumeria', category: 'सजावटी', description: 'सुगंधित फूलों वाला पौधा' },
            { slug: 'aloevera', nameHi: 'एलोवेरा', nameEn: 'Aloe Vera', category: 'औषधीय', description: 'बहुउपयोगी रसीला पौधा' },
            { slug: 'mango', nameHi: 'आम', nameEn: 'Mango', category: 'फलदार वृक्ष', description: 'लोकप्रिय फलदार वृक्ष' },
            { slug: 'litchi', nameHi: 'लीची', nameEn: 'Litchi', category: 'फलदार वृक्ष', description: 'मीठे फल वाला पौधा' },
            { slug: 'tulsi', nameHi: 'तुलसी', nameEn: 'Holy Basil', category: 'औषधीय', description: 'पारंपरिक महत्व वाला पौधा' },
            { slug: 'banyan', nameHi: 'बरगद', nameEn: 'Banyan Tree', category: 'छायादार', description: 'विशाल छायादार वृक्ष' },
            { slug: 'peepal', nameHi: 'पीपल', nameEn: 'Sacred Fig', category: 'पर्यावरणीय', description: 'पारंपरिक एवं पर्यावरणीय महत्व वाला वृक्ष' }
        ];

        const initialTraining = [
            { slug: 'nursery-management', name: 'नर्सरी एवं पौध संवर्धन प्रशिक्षण', description: 'व्यावहारिक नर्सरी प्रबंधन, पौधा उत्पादन, रोपण तकनीक और व्यावसायिक नर्सरी संचालन से संबंधित प्रशिक्षण।', duration: '30 दिन (अस्थायी)', eligibility: 'किसान / महिला समूह / युवा' },
            { slug: 'entrepreneurship', name: 'स्वरोजगार एवं उद्यमिता प्रशिक्षण', description: 'जैविक खेती, वर्मीकम्पोस्ट, प्राकृतिक कीट प्रबंधन और नर्सरी व्यवसाय शुरू करने से संबंधित प्रशिक्षण।', duration: '30 दिन (अस्थायी)', eligibility: '18 वर्ष या उससे अधिक' }
        ];

        await models.Plant.insertMany(initialPlants);
        await models.Training.insertMany(initialTraining);
    } catch (error) { console.error("Seed error:", error); }
};

// Database Connection Middleware
app.use(async (req, res, next) => {
    try { await connectDB(); if(req.path === '/api/health') seedData(); next(); }
    catch (err) { res.status(500).json({ error: 'Database connection failed' }); }
});

// --- Public APIs ---
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/api/plants', async (req, res) => {
    const plants = await models.Plant.find({ isPublished: true }).sort({ nameHi: 1 });
    res.json(plants);
});
app.get('/api/training', async (req, res) => {
    const programs = await models.Training.find({ isPublished: true });
    res.json(programs);
});
app.get('/api/gallery', async (req, res) => {
    const items = await models.Gallery.find({ isPublished: true }).sort({ createdAt: -1 });
    res.json(items);
});
app.post('/api/enquiries', async (req, res) => {
    try {
        const { name, phone, category, email, message } = req.body;
        if (!name || !phone || !category) return res.status(400).json({ error: 'Name, phone, and category required.' });
        await models.Enquiry.create({ name: String(name), phone: String(phone), category: String(category), email: String(email||''), message: String(message||'') });
        res.status(201).json({ success: true, message: 'Enquiry submitted successfully.' });
    } catch (e) { res.status(500).json({ error: 'Submission failed.' }); }
});
app.get('/api/certificates/verify/:certId', apiLimiter, async (req, res) => {
    try {
        const cert = await models.Certificate.findOne({ certId: req.params.certId });
        if (!cert) return res.status(404).json({ error: 'प्रमाण पत्र नहीं मिला (Certificate not found)' });
        res.json({ recipientName: cert.recipientName, programName: cert.programName, issueDate: cert.issueDate, status: cert.status });
    } catch (e) { res.status(500).json({ error: 'Server Error' }); }
});

// Mount Admin Routes
app.use('/admin', adminRouter(models, jwt, bcrypt, authLimiter));

// --- Frontend HTML Rendering (Served securely by Express) ---
app.get('*', (req, res) => {
    if(req.path.startsWith('/api/') || req.path.startsWith('/admin')) return res.status(404).json({error: 'Not found'});
    const currentYear = new Date().getFullYear();
    const html = `
<!DOCTYPE html>
<html lang="hi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>जीविका दीदी ग्रीन नर्सरी | JEEVIKA DIDI GREEN NURSERY</title>
    <meta name="description" content="गुणवत्तापूर्ण पौधे, व्यावहारिक नर्सरी प्रशिक्षण और स्वरोजगार के नए अवसर। जीविका दीदी ग्रीन नर्सरी के साथ बढ़ाएँ हरियाली और आत्मनिर्भरता।">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
    <style>
        :root {
            --forest: #205C3B; --leaf: #5DAE67; --mint: #DDF4D8;
            --cream: #FFF8E9; --yellow: #F4D66D; --terra: #D98762;
            --brown: #805A3B; --white: #FFFFFF; --charcoal: #25352B;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', 'Noto Sans Devanagari', sans-serif; }
        body { background-color: var(--cream); color: var(--charcoal); line-height: 1.6; padding-bottom: 70px; overflow-x: hidden; }
        
        /* Claymorphism Utilities */
        .clay {
            background: var(--white); border-radius: 24px;
            box-shadow: 12px 12px 24px rgba(128, 90, 59, 0.08), -12px -12px 24px rgba(255, 255, 255, 0.8),
                        inset 2px 2px 6px rgba(255, 255, 255, 0.5), inset -2px -2px 6px rgba(0, 0, 0, 0.03);
            border: 1px solid rgba(255,255,255,0.7);
        }
        .clay-green { background: var(--mint); }
        .clay-input {
            width: 100%; padding: 14px 20px; border-radius: 16px; border: none; background: var(--cream);
            box-shadow: inset 4px 4px 8px rgba(0,0,0,0.05), inset -4px -4px 8px rgba(255,255,255,0.8);
            font-size: 1rem; color: var(--charcoal); margin-bottom: 15px; outline: none;
        }
        .clay-input:focus { box-shadow: inset 6px 6px 10px rgba(0,0,0,0.08), inset -6px -6px 10px rgba(255,255,255,0.9), 0 0 0 2px var(--leaf); }
        .clay-btn {
            display: inline-flex; align-items: center; justify-content: center; gap: 8px;
            padding: 14px 28px; border-radius: 50px; border: none; font-weight: 600; cursor: pointer;
            text-decoration: none; transition: all 0.2s ease;
        }
        .clay-btn-primary {
            background: var(--leaf); color: var(--white);
            box-shadow: 6px 6px 12px rgba(93, 174, 103, 0.3), -6px -6px 12px rgba(255, 255, 255, 0.8),
                        inset 2px 2px 4px rgba(255, 255, 255, 0.3), inset -2px -2px 4px rgba(0, 0, 0, 0.1);
        }
        .clay-btn-primary:active { box-shadow: inset 4px 4px 8px rgba(0,0,0,0.2); transform: translateY(2px); }
        .clay-btn-secondary {
            background: var(--cream); color: var(--forest); border: 2px solid var(--mint);
            box-shadow: 4px 4px 10px rgba(0,0,0,0.05), -4px -4px 10px #fff;
        }
        
        /* Typography */
        h1, h2, h3 { color: var(--forest); font-weight: 700; margin-bottom: 15px; }
        h1 { font-size: 2.5rem; line-height: 1.2; } h2 { font-size: 2rem; text-align: center; }
        p { margin-bottom: 15px; }
        
        /* Layout */
        .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        section { padding: 80px 0; }
        
        /* Navbar */
        header { position: sticky; top: 0; background: rgba(255,248,233,0.9); backdrop-filter: blur(10px); z-index: 100; padding: 15px 0; border-bottom: 1px solid var(--mint); }
        .nav-container { display: flex; justify-content: space-between; align-items: center; }
        .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--forest); }
        .brand i { font-size: 2rem; color: var(--leaf); }
        .brand-text h3 { margin: 0; font-size: 1.2rem; }
        .brand-text span { font-size: 0.75rem; color: var(--brown); }
        .nav-links { display: flex; gap: 20px; list-style: none; }
        .nav-links a { text-decoration: none; color: var(--charcoal); font-weight: 600; transition: color 0.3s; }
        .nav-links a:hover { color: var(--leaf); }
        .menu-toggle { display: none; background: none; border: none; font-size: 2rem; color: var(--forest); cursor: pointer; }
        
        /* Hero */
        .hero { display: flex; align-items: center; gap: 40px; min-height: 80vh; }
        .hero-content { flex: 1; }
        .hero-image { flex: 1; position: relative; }
        .hero-image img { width: 100%; border-radius: 30px; object-fit: cover; box-shadow: 10px 10px 30px rgba(0,0,0,0.1); }
        .trust-badges { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
        .badge { background: var(--mint); padding: 8px 16px; border-radius: 20px; font-size: 0.9rem; font-weight: 600; color: var(--forest); }
        
        /* Grid Layouts */
        .grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 24px; }
        .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
        
        /* Cards */
        .card { padding: 24px; text-align: center; transition: transform 0.3s; }
        .card:hover { transform: translateY(-5px); }
        .card i { font-size: 3rem; color: var(--leaf); margin-bottom: 15px; }
        .plant-img { width: 100%; height: 200px; object-fit: cover; border-radius: 16px; margin-bottom: 15px; background: var(--mint); }
        
        /* Mobile Bottom Bar */
        .mobile-bar { display: none; position: fixed; bottom: 0; left: 0; width: 100%; background: var(--white); box-shadow: 0 -4px 10px rgba(0,0,0,0.05); z-index: 1000; padding: 10px; padding-bottom: env(safe-area-inset-bottom); }
        .mobile-actions { display: flex; justify-content: space-around; list-style: none; }
        .mobile-actions a { display: flex; flex-direction: column; align-items: center; text-decoration: none; color: var(--forest); font-size: 0.8rem; gap: 4px; }
        .mobile-actions i { font-size: 1.5rem; }
        
        /* Footer */
        footer { background: var(--charcoal); color: var(--mint); padding: 60px 0 20px; text-align: center; }
        footer a { color: var(--leaf); text-decoration: none; }
        
        @media (max-width: 768px) {
            .nav-links { display: none; flex-direction: column; position: absolute; top: 100%; left: 0; width: 100%; background: var(--cream); padding: 20px; box-shadow: 0 10px 10px rgba(0,0,0,0.1); }
            .nav-links.active { display: flex; }
            .menu-toggle { display: block; }
            .hero { flex-direction: column; text-align: center; margin-top: 40px; }
            .trust-badges { justify-content: center; }
            body { padding-bottom: 80px; }
            .mobile-bar { display: block; }
        }
        
        /* Animations */
        .fade-in { opacity: 0; transform: translateY(20px); animation: fadeIn 0.8s forwards; }
        @keyframes fadeIn { to { opacity: 1; transform: translateY(0); } }
        
        /* Loader */
        .loader { border: 4px solid var(--mint); border-top: 4px solid var(--leaf); border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <header>
        <div class="container nav-container">
            <a href="#" class="brand">
                <i class="ph-fill ph-plant"></i>
                <div class="brand-text">
                    <h3>जीविका दीदी ग्रीन नर्सरी</h3>
                    <span>JEEVIKA DIDI GREEN NURSERY</span>
                </div>
            </a>
            <button class="menu-toggle" onclick="document.getElementById('navMenu').classList.toggle('active')"><i class="ph ph-list"></i></button>
            <ul class="nav-links" id="navMenu">
                <li><a href="#about" onclick="closeMenu()">हमारे बारे में</a></li>
                <li><a href="#services" onclick="closeMenu()">सेवाएँ</a></li>
                <li><a href="#plants" onclick="closeMenu()">पौधे</a></li>
                <li><a href="#training" onclick="closeMenu()">ट्रेनिंग</a></li>
                <li><a href="#verify" onclick="closeMenu()">प्रमाण पत्र</a></li>
                <li><a href="#contact" onclick="closeMenu()">संपर्क</a></li>
            </ul>
        </div>
    </header>

    <main>
        <!-- Hero Section -->
        <section class="container hero fade-in">
            <div class="hero-content">
                <h1>हरियाली का व्यापार,<br>जीविका का आधार</h1>
                <p>गुणवत्तापूर्ण पौधे, व्यावहारिक नर्सरी प्रशिक्षण और स्वरोजगार के नए अवसर। जीविका दीदी ग्रीन नर्सरी के साथ बढ़ाएँ हरियाली और आत्मनिर्भरता।</p>
                <div style="display:flex; gap:15px; flex-wrap:wrap; margin-top:20px;">
                    <a href="#plants" class="clay-btn clay-btn-primary">पौधे देखें <i class="ph ph-arrow-right"></i></a>
                    <a href="https://wa.me/918825172656?text=नमस्ते, मुझे जीविका दीदी ग्रीन नर्सरी के बारे में जानकारी चाहिए।" target="_blank" class="clay-btn clay-btn-secondary"><i class="ph-fill ph-whatsapp-logo"></i> WhatsApp पर पूछें</a>
                </div>
                <div class="trust-badges">
                    <span class="badge"><i class="ph ph-tree"></i> विभिन्न प्रकार के पौधे</span>
                    <span class="badge"><i class="ph ph-chalkboard-teacher"></i> व्यावहारिक प्रशिक्षण</span>
                    <span class="badge"><i class="ph ph-qr-code"></i> QR प्रमाण पत्र सत्यापन</span>
                    <span class="badge"><i class="ph ph-users"></i> किसान एवं युवा उद्यमिता</span>
                </div>
            </div>
            <div class="hero-image">
                <!-- Using an organic placeholder with clay styling if real image isn't available, but structured to hold real photo -->
                <div class="clay clay-green" style="height:400px; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                    <img src="https://images.unsplash.com/photo-1592424097426-5bdf8e9862f1?auto=format&fit=crop&w=800&q=80" alt="Nursery Plants" style="width:100%; height:100%; object-fit:cover;">
                </div>
            </div>
        </section>

        <!-- About Section -->
        <section id="about" class="container">
            <h2>हमारे बारे में</h2>
            <div class="clay" style="padding:40px; text-align:center; margin-top:30px;">
                <i class="ph-fill ph-leaf" style="font-size:3rem; color:var(--leaf); margin-bottom:20px;"></i>
                <p style="font-size:1.1rem; max-width:800px; margin:0 auto;">हम जीविका दीदी ग्रीन नर्सरी में अलग-अलग प्रकार के पौधे प्रदान करते हैं। हमारा उद्देश्य पौधों की उपलब्धता, नर्सरी संबंधी व्यावहारिक प्रशिक्षण और स्वरोजगार के अवसरों को बढ़ावा देना है।</p>
                <div style="margin-top:30px; padding-top:20px; border-top:1px solid var(--mint);">
                    <p style="color:var(--brown); font-weight:600;">संचालक: RUKMINA DEVI, BULET PRASAD, ANKIT KUMAR</p>
                </div>
            </div>
        </section>

        <!-- Services Section -->
        <section id="services" class="container">
            <h2>हमारी सेवाएँ</h2>
            <div class="grid-4" style="margin-top:40px;">
                <div class="clay card">
                    <i class="ph ph-potted-plant"></i>
                    <h3>नर्सरी पालन-पोषण</h3>
                    <p>स्वस्थ पौधों के विकास, उचित देखभाल और पौध संवर्धन संबंधी सेवाएँ।</p>
                </div>
                <div class="clay card">
                    <i class="ph ph-shopping-cart"></i>
                    <h3>पौधों की बिक्री</h3>
                    <p>फलदार, छायादार, औषधीय, काष्ठीय और सजावटी पौधों की उपलब्धता।</p>
                </div>
                <div class="clay card">
                    <i class="ph ph-graduation-cap"></i>
                    <h3>किसान एवं उद्यमिता प्रशिक्षण</h3>
                    <p>नर्सरी प्रबंधन, पौधा उत्पादन, रोपण तकनीक और स्वरोजगार संबंधी व्यावहारिक प्रशिक्षण।</p>
                </div>
                <div class="clay card">
                    <i class="ph ph-certificate"></i>
                    <h3>प्रशिक्षण प्रमाण पत्र</h3>
                    <p>प्रशिक्षण प्रमाण पत्र की जानकारी तथा उपलब्ध होने पर QR कोड द्वारा ऑनलाइन सत्यापन।</p>
                </div>
            </div>
        </section>

        <!-- Plants Catalogue -->
        <section id="plants" class="container">
            <h2>हमारे विशेष पौधे</h2>
            <div style="margin:20px 0; display:flex; gap:10px;">
                <input type="text" id="plantSearch" class="clay-input" placeholder="पौधे का नाम खोजें (हिंदी या English)..." onkeyup="filterPlants()">
            </div>
            <div id="plantsGrid" class="grid-4">
                <div class="loader"></div>
            </div>
        </section>

        <!-- Training Section -->
        <section id="training" class="container">
            <h2>ट्रेनिंग कार्यक्रम</h2>
            <div class="grid-3" id="trainingGrid" style="margin-top:30px; margin-bottom:40px;">
                <div class="loader"></div>
            </div>
            
            <div class="clay" style="padding:40px; margin-top:40px;">
                <h3 style="text-align:center;">ट्रेनिंग के लिए आवेदन करें</h3>
                <form id="trainingForm" onsubmit="submitEnquiry(event, 'Training')" style="max-width:600px; margin:0 auto;">
                    <input type="text" id="tName" class="clay-input" placeholder="आपका नाम *" required>
                    <input type="tel" id="tPhone" class="clay-input" placeholder="मोबाइल नंबर *" required>
                    <input type="text" id="tMsg" class="clay-input" placeholder="गाँव/शहर और पसंदीदा कोर्स *">
                    <label style="display:block; margin:10px 0; font-size:0.9rem;">
                        <input type="checkbox" required> मैं अपनी जानकारी साझा करने की सहमति देता/देती हूँ।
                    </label>
                    <button type="submit" class="clay-btn clay-btn-primary" style="width:100%;">आवेदन भेजें</button>
                    <p id="tResult" style="text-align:center; margin-top:15px;"></p>
                </form>
            </div>
        </section>

        <!-- QR Certificate Verification -->
        <section id="verify" class="container">
            <div class="clay clay-green" style="padding:50px 20px; text-align:center;">
                <h2>QR-सत्यापित प्रशिक्षण प्रमाण पत्र</h2>
                <p>प्रशिक्षण प्रमाण पत्र की प्रामाणिकता जानने के लिए उपलब्ध QR कोड या प्रमाण पत्र ID के माध्यम से सत्यापन करें।</p>
                <div style="max-width:400px; margin:30px auto; display:flex; gap:10px;">
                    <input type="text" id="certId" class="clay-input" placeholder="प्रमाण पत्र ID दर्ज करें" style="margin:0;">
                    <button onclick="verifyCert()" class="clay-btn clay-btn-primary">सत्यापित करें</button>
                </div>
                <div id="certResult" style="margin-top:20px; min-height:50px;"></div>
            </div>
        </section>

        <!-- Location & Contact -->
        <section id="contact" class="container">
            <h2>हमारा स्थान एवं संपर्क</h2>
            <div class="grid-3" style="margin-top:30px;">
                <div class="clay" style="padding:30px;">
                    <h3>संपर्क विवरण</h3>
                    <p><i class="ph-fill ph-phone" style="color:var(--leaf);"></i> +91 8825172656</p>
                    <p><i class="ph-fill ph-phone" style="color:var(--leaf);"></i> +91 8292480148</p>
                    <p><i class="ph-fill ph-envelope" style="color:var(--leaf);"></i> Jeevikadidigreennursery@gmail.com</p>
                    <p><i class="ph-fill ph-map-pin" style="color:var(--leaf);"></i> PAKADIYA, P.O. AJGARI MATH, P.S. BANJARIYA, EAST CHAMPARAN, BIHAR, INDIA. Pin: 845401</p>
                    <div style="margin-top:20px; display:flex; gap:15px;">
                        <a href="#" style="color:var(--forest); font-size:1.5rem;"><i class="ph-fill ph-facebook-logo"></i></a>
                        <a href="#" style="color:var(--forest); font-size:1.5rem;"><i class="ph-fill ph-instagram-logo"></i></a>
                    </div>
                    <p style="font-size:0.8rem; margin-top:10px;">@jeevikadidigreennursery</p>
                </div>
                <div class="clay" style="padding:30px; grid-column: span 2;">
                    <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d113524.36423985449!2d84.8488!3d26.6482!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x399335f60b8d80e1%3A0x6d80dc7a77f98fc8!2sEast%20Champaran%2C%20Bihar!5e0!3m2!1sen!2sin!4v1700000000000!5m2!1sen!2sin" width="100%" height="300" style="border:0; border-radius:16px;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
                    <a href="https://maps.google.com/?q=PAKADIYA,AJGARI+MATH,BANJARIYA,EAST+CHAMPARAN,BIHAR" target="_blank" class="clay-btn clay-btn-primary" style="margin-top:20px; width:100%;"><i class="ph-fill ph-navigation-arrow"></i> Google Maps में रास्ता देखें</a>
                </div>
            </div>
        </section>
    </main>

    <!-- Mobile Bottom Action Bar -->
    <nav class="mobile-bar">
        <ul class="mobile-actions">
            <li><a href="tel:+918825172656"><i class="ph-fill ph-phone-call"></i> कॉल करें</a></li>
            <li><a href="https://wa.me/918825172656"><i class="ph-fill ph-whatsapp-logo" style="color:#25D366;"></i> WhatsApp</a></li>
            <li><a href="https://maps.google.com/?q=PAKADIYA,EAST+CHAMPARAN,BIHAR" target="_blank"><i class="ph-fill ph-map-pin"></i> रास्ता</a></li>
        </ul>
    </nav>

    <footer>
        <div class="container">
            <h3 style="color:var(--mint); margin-bottom:5px;">जीविका दीदी ग्रीन नर्सरी</h3>
            <p>हरियाली का व्यापार, जीविका का आधार</p>
            <div style="margin:20px 0;">
                <a href="/admin" style="font-size:0.9rem;">एडमिन लॉगिन (Admin)</a>
            </div>
            <p style="font-size:0.8rem; margin-top:30px; opacity:0.7;">&copy; ${currentYear} Jeevika Didi Green Nursery. All rights reserved.</p>
        </div>
    </footer>

    <script>
        let allPlants = [];
        
        function closeMenu() { document.getElementById('navMenu').classList.remove('active'); }
        
        async function fetchPlants() {
            try {
                const res = await fetch('/api/plants');
                allPlants = await res.json();
                renderPlants(allPlants);
            } catch(e) { document.getElementById('plantsGrid').innerHTML = '<p>डेटा लोड करने में विफल।</p>'; }
        }

        async function fetchTraining() {
            try {
                const res = await fetch('/api/training');
                const data = await res.json();
                const html = data.map(t => \`
                    <div class="clay card" style="text-align:left;">
                        <h3 style="margin-bottom:10px;">\${t.name}</h3>
                        <p style="font-size:0.9rem; color:#555;">\${t.description}</p>
                        <ul style="font-size:0.85rem; margin:15px 0 15px 20px;">
                            <li><strong>अवधि:</strong> \${t.duration}</li>
                            <li><strong>पात्रता:</strong> \${t.eligibility}</li>
                        </ul>
                        <a href="#trainingForm" class="clay-btn clay-btn-primary" style="width:100%; text-align:center;">आवेदन करें</a>
                    </div>
                \`).join('');
                document.getElementById('trainingGrid').innerHTML = html;
            } catch(e) { document.getElementById('trainingGrid').innerHTML = '<p>डेटा लोड करने में विफल।</p>'; }
        }
        
        function renderPlants(plants) {
            const grid = document.getElementById('plantsGrid');
            if(plants.length === 0) { grid.innerHTML = '<p style="grid-column:1/-1; text-align:center;">कोई पौधा नहीं मिला।</p>'; return; }
            grid.innerHTML = plants.map(p => \`
                <div class="clay card">
                    <div class="plant-img" style="display:flex;align-items:center;justify-content:center;background:var(--mint);">
                        <i class="ph-fill ph-plant" style="font-size:4rem;color:var(--leaf);margin:0;"></i>
                    </div>
                    <h3 style="margin-bottom:5px;">\${p.nameHi}</h3>
                    <p style="font-size:0.9rem; color:#666; margin-bottom:5px;">\${p.nameEn}</p>
                    <span class="badge" style="background:var(--cream); border:1px solid var(--mint); margin-bottom:15px; display:inline-block;">\${p.category}</span>
                    <a href="https://wa.me/918825172656?text=नमस्ते, मुझे '\${p.nameHi} (\${p.nameEn})' पौधे की जानकारी चाहिए।" target="_blank" class="clay-btn clay-btn-primary" style="width:100%; font-size:0.9rem;">पूछताछ करें</a>
                </div>
            \`).join('');
        }
        
        function filterPlants() {
            const query = document.getElementById('plantSearch').value.toLowerCase();
            const filtered = allPlants.filter(p => p.nameHi.toLowerCase().includes(query) || p.nameEn.toLowerCase().includes(query));
            renderPlants(filtered);
        }

        async function submitEnquiry(e, category) {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const resEl = document.getElementById('tResult');
            btn.disabled = true; btn.innerText = "भेज रहे हैं...";
            try {
                const res = await fetch('/api/enquiries', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        name: document.getElementById('tName').value,
                        phone: document.getElementById('tPhone').value,
                        category: category,
                        message: document.getElementById('tMsg').value
                    })
                });
                const data = await res.json();
                if(data.success) { resEl.innerHTML = '<span style="color:green;">आवेदन सफलतापूर्वक भेज दिया गया है।</span>'; e.target.reset(); }
                else { resEl.innerHTML = '<span style="color:red;">त्रुटि: ' + data.error + '</span>'; }
            } catch(err) { resEl.innerHTML = '<span style="color:red;">नेटवर्क त्रुटि।</span>'; }
            btn.disabled = false; btn.innerText = "आवेदन भेजें";
        }

        async function verifyCert() {
            const id = document.getElementById('certId').value.trim();
            const resEl = document.getElementById('certResult');
            if(!id) return;
            resEl.innerHTML = '<div class="loader"></div>';
            try {
                const res = await fetch('/api/certificates/verify/' + id);
                const data = await res.json();
                if(data.error) { resEl.innerHTML = \`<div class="clay" style="border-left:4px solid red; padding:15px;">\${data.error}</div>\`; }
                else {
                    resEl.innerHTML = \`
                        <div class="clay" style="border-left:4px solid var(--leaf); padding:20px; text-align:left;">
                            <h4 style="color:var(--forest); margin-bottom:10px;"><i class="ph-fill ph-check-circle" style="color:var(--leaf);"></i> मान्य प्रमाण पत्र</h4>
                            <p><strong>नाम:</strong> \${data.recipientName}</p>
                            <p><strong>कोर्स:</strong> \${data.programName}</p>
                            <p><strong>स्थिति:</strong> \${data.status}</p>
                        </div>
                    \`;
                }
            } catch(e) { resEl.innerHTML = '<p style="color:red;">सर्वर से संपर्क नहीं हो सका।</p>'; }
        }

        window.onload = () => { fetchPlants(); fetchTraining(); };
    </script>
</body>
</html>
`;
    res.send(html);
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Dev server running on port ${PORT}`));
}

module.exports = app;
