/**
 * Who may see a business's data.
 *
 *   - the business itself
 *   - the advisor that business is linked to (users.advisor_id)
 *
 * No other advisor can see it. Callers should answer "not found" rather than
 * "forbidden" for a business the advisor doesn't own, so ids can't be probed.
 */
const { query } = require('../db');

async function advisorOwnsBusiness(advisorId, businessId) {
  const rows = await query(
    "SELECT id FROM users WHERE id = :business_id AND role = 'business' AND advisor_id = :advisor_id LIMIT 1",
    { business_id: businessId, advisor_id: advisorId }
  );
  return rows.length > 0;
}

async function canAccessBusinessData(user, businessId) {
  if (user.role === 'business') return user.id === businessId;
  if (user.role === 'advisor') return advisorOwnsBusiness(user.id, businessId);
  return false;
}

module.exports = { advisorOwnsBusiness, canAccessBusinessData };
