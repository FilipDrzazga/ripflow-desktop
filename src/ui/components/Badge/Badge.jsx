import style from "./Badge.module.css";
const badgeArr = [
    { type: 'LM', text: 'LINEAR METER', bgColor: '#f1f5f9', textColor: '#334155', borderColor: '#cbd5e1' },
    { type: 'FQ', text: 'FAT QUARTER', bgColor: '#f1f5f9', textColor: '#334155', borderColor: '#cbd5e1' },
    { type: 'CUSHION', text: 'CUSHION', bgColor: '#f1f5f9', textColor: '#334155', borderColor: '#cbd5e1' },
    { type: 'SAMPLE', text: 'SAMPLE', bgColor: '#f1f5f9', textColor: '#334155', borderColor: '#cbd5e1' },
    { type: 'Poly', text: 'Poly', bgColor: '#eef2ff', textColor: '#4338ca', borderColor: '#6366f1' },
    { type: 'Cotton', text: 'Cotton', bgColor: '#ecfeff', textColor: '#0e7490', borderColor: '#06b6d4' },
    { type: 'OK', text: 'APPROVED', bgColor: '#ecfdf5', textColor: '#047857', borderColor: '#10b981' },
    { type: 'INVALID', text: 'INVALID', bgColor: '#fffbeb', textColor: '#b45309', borderColor: '#f59e0b' },
];

const Badge = ({ type }) => {
    return (
        <div className={style.badge_container}>
{            badgeArr.map((badge)=>{
                if(badge.type === type){
                    return (
                        <div key={badge.type} className={style.badge} style={{ backgroundColor: badge.bgColor, color: badge.textColor, border: `1px solid ${badge.borderColor}` }}>
                            {badge.text}
                        </div>
                    )
                }
            })}
        </div>
    )
};

export default Badge;