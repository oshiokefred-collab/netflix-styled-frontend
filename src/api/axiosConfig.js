import axios from 'axios';

export default axios.create({
    baseURL:'http://aaf2b248436f04c76be85227a9f32175-1821011344.us-east-1.elb.amazonaws.com:8080',
    headers: {
        'Content-Type': 'application/json',
    },
});
