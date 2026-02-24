export const getFileAgeInDays = (file) => {
    const now = new Date();
    const fileCreateAt = file.birthtime;
    const diffTime = Math.abs(now - fileCreateAt);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}