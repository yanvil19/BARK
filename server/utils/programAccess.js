const Program = require('../models/Program');

// Program IDs a faculty user can work with: Professors and Program Chairs get
// their assigned program, Deans get every active program in their department.
async function getAccessibleProgramIds(user) {
  if (user.role === 'professor' || user.role === 'program_chair') {
    if (!user.program) return [];
    return [user.program.toString()];
  }
  if (user.role === 'dean') {
    if (!user.department) return [];
    const programs = await Program.find({ department: user.department, isActive: true }).select('_id');
    return programs.map((p) => p._id.toString());
  }
  return [];
}

module.exports = { getAccessibleProgramIds };
