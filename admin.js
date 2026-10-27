const express = require('express');

module.exports = function(models, jwt, bcrypt, authLimiter) {
    const router = express.Router();
    
    // Auth Middleware for API
    const requireAuth = (req, res, next) => {
        const token = req.cookies.admin_token;
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'fallback_secret_do_not_use_in_prod');
            req.admin = decoded;
            next();
        } catch (e) { res.status(401).json({ error: 'Invalid session' }); }
    };

    // Auth Routes
    router.post('/api/login', authLimiter, async (req, res) => {
        const { username, password } = req.body;
        // Check ENV credentials directly
        const envUser = process.env.ADMIN_USERNAME;
        const envPassHash = process.env.ADMIN_PASSWORD_HASH;
        
        if (envUser && envPassHash && username === envUser) {
            const isMatch = await bcrypt.compare(password, envPassHash);
            if (isMatch) {
                const token = jwt.sign({ user: username }, process.env.SESSION_SECRET || 'fallback_secret_do_not_use_in_prod', { expiresIn: '12h' });
                res.cookie('admin_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 12 * 3600000 });
                return res.json({ success: true });
            }
        }
        res.status(401).json({ error: 'Invalid credentials' });
    });

    router.post('/api/logout', (req, res) => {
        res.clearCookie('admin_token');
        res.json({ success: true });
    });

    router.get('/api/session', (req, res) => {
        const token = req.cookies.admin_token;
        if (!token) return res.json({ loggedIn: false });
        try {
            jwt.verify(token, process.env.SESSION_SECRET || 'fallback_secret_do_not_use_in_prod');
            res.json({ loggedIn: true });
        } catch (e) { res.json({ loggedIn: false }); }
    });

    // Admin Data APIs (Protected)
    router.get('/api/stats', requireAuth, async (req, res) => {
        try {
            const plants = await models.Plant.countDocuments();
            const enquiries = await models.Enquiry.countDocuments();
            const newEnquiries = await models.Enquiry.countDocuments({ status: 'New' });
            const certificates = await models.Certificate.countDocuments();
            res.json({ plants, enquiries, newEnquiries, certificates });
        } catch (e) { res.status(500).json({ error: 'Stats error' }); }
    });

    router.get('/api/enquiries', requireAuth, async (req, res) => {
        const items = await models.Enquiry.find().sort({ createdAt: -1 }).limit(100);
        res.json(items);
    });

    router.put('/api/enquiries/:id/status', requireAuth, async (req, res) => {
        await models.Enquiry.findByIdAndUpdate(req.params.id, { status: req.body.status });
        res.json({ success: true });
    });

    router.post('/api/certificates', requireAuth, async (req, res) => {
        try {
            const { certId, recipientName, programName } = req.body;
            await models.Certificate.create({ certId, recipientName, programName });
            res.json({ success: true });
        } catch (e) { res.status(400).json({ error: 'Duplicate ID or validation error' }); }
    });

    // Admin UI Route
    router.get('/', (req, res) => {
        res.send(`
<!DOCTYPE html>
<html lang="hi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin - Jeevika Didi Green Nursery</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
    <style>
        :root { --forest: #205C3B; --leaf: #5DAE67; --mint: #DDF4D8; --cream: #FFF8E9; --white: #FFFFFF; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
        body { background-color: var(--cream); color: #333; }
        
        .clay {
            background: var(--white); border-radius: 20px; padding: 20px;
            box-shadow: 8px 8px 16px rgba(0,0,0,0.05), -8px -8px 16px rgba(255,255,255,0.8);
        }
        .input { width: 100%; padding: 12px; margin-bottom: 15px; border-radius: 12px; border: none; background: #f5f5f5; outline: none; }
        .btn { padding: 12px 24px; border-radius: 12px; border: none; background: var(--leaf); color: white; cursor: pointer; font-weight: bold; }
        
        .container { max-width: 1000px; margin: 50px auto; padding: 20px; }
        
        #loginScreen { max-width: 400px; margin: 100px auto; text-align: center; }
        #dashboard { display: none; }
        
        .nav { display: flex; gap: 15px; margin-bottom: 30px; border-bottom: 2px solid var(--mint); padding-bottom: 10px; }
        .nav button { background: none; border: none; font-size: 1.1rem; color: var(--forest); cursor: pointer; font-weight: 600; padding: 5px 10px; border-radius: 8px; }
        .nav button.active { background: var(--mint); }
        
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { text-align: center; }
        .stat-card h2 { font-size: 2.5rem; color: var(--leaf); }
        
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: var(--mint); color: var(--forest); }
    </style>
</head>
<body>
    <div id="loginScreen" class="clay">
        <h2 style="color:var(--forest); margin-bottom:20px;">एडमिन लॉगिन</h2>
        <form onsubmit="login(event)">
            <input type="text" id="username" class="input" placeholder="Username" required>
            <input type="password" id="password" class="input" placeholder="Password" required>
            <button type="submit" class="btn" style="width:100%;">Login</button>
            <p id="loginErr" style="color:red; margin-top:10px;"></p>
        </form>
    </div>

    <div id="dashboard" class="container">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <h1 style="color:var(--forest);">डैशबोर्ड</h1>
            <button onclick="logout()" class="btn" style="background:#d9534f;">Logout</button>
        </div>
        
        <div class="nav">
            <button class="active" onclick="showTab('overview')">Overview</button>
            <button onclick="showTab('enquiries'); loadEnquiries();">Enquiries</button>
            <button onclick="showTab('certs')">Certificates</button>
        </div>

        <div id="tab-overview" class="tab-content">
            <div class="stat-grid">
                <div class="clay stat-card"><h2 id="s-plants">0</h2><p>Total Plants</p></div>
                <div class="clay stat-card"><h2 id="s-enq">0</h2><p>Total Enquiries</p></div>
                <div class="clay stat-card"><h2 id="s-new">0</h2><p>New Enquiries</p></div>
                <div class="clay stat-card"><h2 id="s-cert">0</h2><p>Certificates Issued</p></div>
            </div>
        </div>

        <div id="tab-enquiries" class="tab-content" style="display:none;">
            <div class="clay">
                <h3>हाल की पूछताछ (Enquiries)</h3>
                <div style="overflow-x:auto;">
                    <table>
                        <thead><tr><th>Name</th><th>Phone</th><th>Category</th><th>Status</th><th>Action</th></tr></thead>
                        <tbody id="enqBody"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <div id="tab-certs" class="tab-content" style="display:none;">
            <div class="clay" style="max-width:500px;">
                <h3>नया प्रमाण पत्र जारी करें</h3>
                <form onsubmit="issueCert(event)" style="margin-top:15px;">
                    <input type="text" id="cId" class="input" placeholder="Certificate ID (e.g. JDGN-001)" required>
                    <input type="text" id="cName" class="input" placeholder="Recipient Name" required>
                    <input type="text" id="cProg" class="input" placeholder="Program Name" required>
                    <button type="submit" class="btn">Issue Certificate</button>
                    <p id="cResult" style="margin-top:10px;"></p>
                </form>
            </div>
        </div>
    </div>

    <script>
        async function checkSession() {
            const res = await fetch('/admin/api/session');
            const data = await res.json();
            if (data.loggedIn) {
                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('dashboard').style.display = 'block';
                loadStats();
            } else {
                document.getElementById('loginScreen').style.display = 'block';
                document.getElementById('dashboard').style.display = 'none';
            }
        }

        async function login(e) {
            e.preventDefault();
            const res = await fetch('/admin/api/login', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({username:document.getElementById('username').value, password:document.getElementById('password').value})
            });
            if(res.ok) checkSession();
            else document.getElementById('loginErr').innerText = 'Invalid credentials';
        }

        async function logout() {
            await fetch('/admin/api/logout', {method:'POST'});
            checkSession();
        }

        function showTab(id) {
            document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.nav button').forEach(el => el.classList.remove('active'));
            document.getElementById('tab-' + id).style.display = 'block';
            event.target.classList.add('active');
        }

        async function loadStats() {
            const res = await fetch('/admin/api/stats');
            if(!res.ok) return;
            const data = await res.json();
            document.getElementById('s-plants').innerText = data.plants;
            document.getElementById('s-enq').innerText = data.enquiries;
            document.getElementById('s-new').innerText = data.newEnquiries;
            document.getElementById('s-cert').innerText = data.certificates;
        }

        async function loadEnquiries() {
            const res = await fetch('/admin/api/enquiries');
            const data = await res.json();
            document.getElementById('enqBody').innerHTML = data.map(e => \`
                <tr>
                    <td>\${e.name}</td>
                    <td>\${e.phone}</td>
                    <td>\${e.category}</td>
                    <td>
                        <select onchange="updateEnq('\${e._id}', this.value)">
                            <option \${e.status==='New'?'selected':''}>New</option>
                            <option \${e.status==='Resolved'?'selected':''}>Resolved</option>
                        </select>
                    </td>
                    <td>\${new Date(e.createdAt).toLocaleDateString()}</td>
                </tr>
            \`).join('');
        }

        async function updateEnq(id, status) {
            await fetch('/admin/api/enquiries/' + id + '/status', {
                method:'PUT', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({status})
            });
            loadStats();
        }

        async function issueCert(e) {
            e.preventDefault();
            const res = await fetch('/admin/api/certificates', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({
                    certId: document.getElementById('cId').value,
                    recipientName: document.getElementById('cName').value,
                    programName: document.getElementById('cProg').value
                })
            });
            const p = document.getElementById('cResult');
            if(res.ok) { p.innerText = 'Certificate Issued!'; p.style.color = 'green'; e.target.reset(); loadStats(); }
            else { p.innerText = 'Error issuing certificate (duplicate ID?)'; p.style.color = 'red'; }
        }

        checkSession();
    </script>
</body>
</html>
        `);
    });

    return router;
};
