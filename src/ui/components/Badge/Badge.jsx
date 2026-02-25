import style from "./Badge.module.css";
const badgeArr = [
    { type: 'Linear Meter', bgColor: '#f1f5f9', textColor: '#334155'},
    { type: 'Fat Quarter', bgColor: '#f1f5f9', textColor: '#334155' },
    { type: 'Cushion', bgColor: '#f1f5f9', textColor: '#334155'},
    { type: 'Sample', bgColor: '#f1f5f9', textColor: '#334155' },
    { type: 'Tea Towel', bgColor: '#f1f5f9', textColor: '#334155' },
    { type: 'Poly', bgColor: '#eef2ff', textColor: '#4338ca' },
    { type: 'Cotton', bgColor: '#ecfeff', textColor: '#0e7490' },
    { type: 'OK', bgColor: '#ecfdf5', textColor: '#047857' },
    { type: 'INVALID', bgColor: '#fffbeb', textColor: '#b45309' },
    { type: 'UNKNOWN', bgColor: '#fff7ed', textColor: '#c2410c' },
    { type: 'DiffDays', bgColor: '#ffffff', textColor: '#171717' },


];

const Badge = ({ type, badgeText }) => {
    return (
        <div className={style.badge_container}>
{            badgeArr.map((badge)=>{
                if(badge.type === type){
                    return (
                        <div key={badge.type} className={style.badge} style={{ backgroundColor: badge.bgColor, color: badge.textColor }}>
                            {badgeText.toUpperCase()}
                        </div>
                    )
                }
            })}
        </div>
    )
};

export default Badge;