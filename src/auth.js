function requireAuth(req, res, next) {
  if (!process.env.DASHBOARD_PASSWORD) {
    // Si no se configuró contraseña, no se bloquea el acceso (no recomendado en producción)
    return next();
  }
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.status(401).json({ error: 'No autenticado' });
}

module.exports = { requireAuth };
