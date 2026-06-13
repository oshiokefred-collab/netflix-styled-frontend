import axios from 'axios';

export default axios.create({
    baseURL: 'http://3.88.9.221:30080',
    headers: {
        'Content-Type': 'application/json',
    },
});