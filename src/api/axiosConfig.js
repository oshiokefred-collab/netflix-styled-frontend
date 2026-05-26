import axios from 'axios';

export default axios.create({
    baseURL:'http://13.222.129.187:8080',
    headers: {
        'Content-Type': 'application/json',
    },
});
